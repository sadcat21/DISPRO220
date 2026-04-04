import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { ALGERIAN_WILAYAS } from '@/data/algerianWilayas';
import { StampPriceTier } from '@/types/stamp';
import { calculateStampAmount } from '@/hooks/useStampTiers';

interface HandoverItem {
  order_id: string;
  payment_method: string;
  amount: number;
  customer_name: string | null;
  base_amount?: number;
  stamp_amount?: number;
  stamp_percentage?: number;
  invoice_number?: string;
  invoice_date?: string;
  check_number?: string;
  check_date?: string;
  check_bank?: string;
  receipt_number?: string;
  transfer_reference?: string;
}

interface Props {
  handoverId: string;
  handoverDate: string;
  cashInvoice1: number;
  cashInvoice2: number;
  checksAmount: number;
  receiptsAmount: number;
  transfersAmount: number;
  totalAmount: number;
  branchName?: string;
  branchWilaya?: string;
  deliveryMethod?: string;
  intermediaryName?: string;
  bankTransferReference?: string;
  receivedBy?: string;
  unifiedCash?: boolean;
  onReady?: () => void;
}

const HandoverPrintView: React.FC<Props> = ({
  handoverId,
  handoverDate,
  cashInvoice1,
  cashInvoice2,
  checksAmount,
  receiptsAmount,
  transfersAmount,
  totalAmount,
  branchWilaya,
  deliveryMethod,
  intermediaryName,
  bankTransferReference,
  receivedBy,
  unifiedCash,
  onReady,
}) => {
  const [items, setItems] = useState<HandoverItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      const { data: stampTiers } = await supabase
        .from('stamp_price_tiers')
        .select('*')
        .eq('is_active', true)
        .order('min_amount', { ascending: true });

      const { data } = await supabase
        .from('handover_items')
        .select('order_id, payment_method, amount, customer_name, treasury_entry_id')
        .eq('handover_id', handoverId);

      if (!data?.length) {
        setLoading(false);
        onReady?.();
        return;
      }

      const treasuryIds = data.filter((item) => item.treasury_entry_id).map((item) => item.treasury_entry_id);
      const treasuryMap: Record<string, any> = {};
      if (treasuryIds.length > 0) {
        const { data: treasuryEntries } = await supabase
          .from('manager_treasury')
          .select('id, invoice_number, invoice_date, check_number, check_date, check_bank, receipt_number, transfer_reference')
          .in('id', treasuryIds);
        (treasuryEntries || []).forEach((entry) => {
          treasuryMap[entry.id] = entry;
        });
      }

      const orderIds = data.map((item) => item.order_id).filter(Boolean);
      const orderMap: Record<string, any> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, created_at, delivery_date, total_amount, order_items(total_price), customers(name_fr, name, store_name_fr, store_name)')
          .in('id', orderIds);
        (orders || []).forEach((order) => {
          orderMap[order.id] = order;
        });
      }

      const enriched: HandoverItem[] = data.map((item) => {
        const treasuryEntry = item.treasury_entry_id ? treasuryMap[item.treasury_entry_id] : null;
        const order = item.order_id ? orderMap[item.order_id] : null;
        const customer = order?.customers;
        const customerName = customer?.name_fr || customer?.name || item.customer_name;
        const itemsSubtotal = (order?.order_items || []).reduce((sum: number, orderItem: any) => sum + Number(orderItem.total_price || 0), 0);
        const stampBaseAmount = itemsSubtotal > 0 ? itemsSubtotal : Number(order?.total_amount || item.amount || 0);
        const activeTiers = (stampTiers || []) as StampPriceTier[];
        const matchedTier = item.payment_method === 'cash'
          ? activeTiers.find((tier) => stampBaseAmount >= tier.min_amount && (tier.max_amount === null || stampBaseAmount <= tier.max_amount))
          : null;
        const exactStampAmount = item.payment_method === 'cash' && matchedTier
          ? Number(calculateStampAmount(stampBaseAmount, activeTiers).toFixed(2))
          : 0;
        return {
          ...item,
          customer_name: customerName || item.customer_name,
          base_amount: item.payment_method === 'cash'
            ? Number((Number(item.amount || 0) - exactStampAmount).toFixed(2))
            : undefined,
          stamp_amount: item.payment_method === 'cash' ? exactStampAmount : undefined,
          stamp_percentage: item.payment_method === 'cash' ? Number(matchedTier?.percentage || 0) : undefined,
          invoice_number: treasuryEntry?.invoice_number || undefined,
          invoice_date: treasuryEntry?.invoice_date || (order ? format(new Date(order.delivery_date || order.created_at), 'dd/MM/yyyy') : undefined),
          check_number: treasuryEntry?.check_number || undefined,
          check_date: treasuryEntry?.check_date || undefined,
          check_bank: treasuryEntry?.check_bank || undefined,
          receipt_number: treasuryEntry?.receipt_number || undefined,
          transfer_reference: treasuryEntry?.transfer_reference || undefined,
        };
      });

      setItems(enriched);
      setLoading(false);
      setTimeout(() => onReady?.(), 100);
    };

    fetchItems();
  }, [handoverId, onReady]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const checks = items.filter((item) => item.payment_method === 'check');
  const receiptDocs = items.filter((item) => item.payment_method === 'receipt');
  const receiptCash = items.filter((item) => item.payment_method === 'receipt_cash');
  const cashItems = items.filter((item) => item.payment_method === 'cash');
  const transfers = items.filter((item) => item.payment_method === 'transfer');

  const cashItemsTotal = cashItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const receiptCashTotal = receiptCash.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const stampAmount = Math.max(0, cashInvoice1 - cashItemsTotal - receiptCashTotal);
  const dateStr = format(new Date(handoverDate), 'dd/MM/yyyy');
  const wilayaFr = branchWilaya ? ALGERIAN_WILAYAS.find((wilaya) => wilaya.name === branchWilaya)?.nameFr || branchWilaya : '';
  const cashItemsWithStamp: HandoverItem[] = (() => {
    if (cashItems.length === 0) return [];

    if (stampAmount <= 0 || cashItemsTotal <= 0) {
      return cashItems.map((item) => ({
        ...item,
        base_amount: Number(item.amount || 0),
        stamp_amount: 0,
      }));
    }

    let distributedStamp = 0;
    return cashItems.map((item, index) => {
      const itemAmount = Number(item.amount || 0);
      const isLast = index === cashItems.length - 1;
      const itemStamp = isLast
        ? Math.max(0, Number((stampAmount - distributedStamp).toFixed(2)))
        : Number(((stampAmount * itemAmount) / cashItemsTotal).toFixed(2));

      distributedStamp += itemStamp;

      return {
        ...item,
        base_amount: Math.max(0, Number((itemAmount - itemStamp).toFixed(2))),
        stamp_amount: itemStamp,
      };
    });
  })();
  const cashItemsNetTotal = cashItemsWithStamp.reduce((sum, item) => sum + Number(item.base_amount || 0), 0);

  const renderSimpleTable = (
    title: string,
    tableItems: HandoverItem[],
    total: number,
    extraColumns?: Array<{
      header: string;
      cell: (item: HandoverItem) => string;
      className?: string;
    }>,
  ) => {
    if (tableItems.length === 0) return null;

    return (
      <div className="mb-4" data-pdf-section>
        <h3 className="mb-1 text-sm font-bold">{title} ({tableItems.length})</h3>
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr>
              <th className="border border-black p-1 text-left">Client</th>
              <th className="border border-black p-1 text-left">N° Facture</th>
              <th className="border border-black p-1 text-right">Montant</th>
              {(extraColumns || []).map((column) => (
                <th key={column.header} className={`border border-black p-1 text-left ${column.className || ''}`}>
                  {column.header}
                </th>
              ))}
              <th className="border border-black p-1 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {tableItems.map((item, index) => (
              <tr key={`${title}-${index}`}>
                <td className="border border-black p-1">{item.customer_name || '-'}</td>
                <td className="border border-black p-1">{item.invoice_number || '-'}</td>
                <td className="border border-black p-1 text-right">{item.amount.toLocaleString()}</td>
                {(extraColumns || []).map((column) => (
                  <td key={column.header} className={`border border-black p-1 ${column.className || ''}`}>
                    {column.cell(item)}
                  </td>
                ))}
                <td className="border border-black p-1">{item.invoice_date || item.check_date || '-'}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border border-black p-1" colSpan={2}>Total {title}</td>
              <td className="border border-black p-1 text-right">{total.toLocaleString()}</td>
              <td className="border border-black p-1" colSpan={(extraColumns?.length || 0) + 1}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderCashInvoice1Table = () => {
    if (cashItemsWithStamp.length === 0) return null;

    return (
      <div className="mb-4" data-pdf-section>
        <h3 className="mb-1 text-sm font-bold">ESPÈCES FACTURE 1 ({cashItemsWithStamp.length})</h3>
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr>
              <th className="border border-black p-1 text-left">Client</th>
              <th className="border border-black p-1 text-left">NÂ° Facture</th>
              <th className="border border-black p-1 text-right">Montant HT</th>
              <th className="border border-black p-1 text-right">Timbre</th>
              <th className="border border-black p-1 text-right">Montant TTC</th>
              <th className="border border-black p-1 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {cashItemsWithStamp.map((item, index) => (
              <tr key={`cash-invoice1-${index}`}>
                <td className="border border-black p-1">{item.customer_name || '-'}</td>
                <td className="border border-black p-1">{item.invoice_number || '-'}</td>
                <td className="border border-black p-1 text-right">{Number(item.base_amount || 0).toLocaleString()}</td>
                <td className="border border-black p-1 text-right">{Number(item.stamp_amount || 0).toLocaleString()}</td>
                <td className="border border-black p-1 text-right">{Number(item.amount || 0).toLocaleString()}</td>
                <td className="border border-black p-1">{item.invoice_date || item.check_date || '-'}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border border-black p-1" colSpan={2}>Total ESPÈCES FACTURE 1</td>
              <td className="border border-black p-1 text-right">{cashItemsNetTotal.toLocaleString()}</td>
              <td className="border border-black p-1 text-right">{stampAmount.toLocaleString()}</td>
              <td className="border border-black p-1 text-right">{cashItemsTotal.toLocaleString()}</td>
              <td className="border border-black p-1"></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="print-handover bg-white p-8 font-sans text-black" style={{ direction: 'ltr', fontSize: '12px', textAlign: 'left', unicodeBidi: 'plaintext' }}>
      <p className="mb-2" data-pdf-section style={{ textAlign: 'left' }}>
        <strong>Date d'envoi:</strong> {dateStr}{wilayaFr ? `  -  Depot ${wilayaFr}` : ''}
      </p>

      {deliveryMethod && (
        <p className="mb-4" data-pdf-section style={{ textAlign: 'left', margin: '0 0 16px 0', lineHeight: '1.8' }}>
          <span>Mode: </span>
          <strong>{deliveryMethod === 'direct' ? 'Remise directe' : deliveryMethod === 'bank_transfer' ? 'Virement bancaire' : 'Par intermédiaire'}</strong>
          {receivedBy && (
            <>
              <span style={{ margin: '0 12px' }}>|</span>
              <span>Destinataire: </span>
              <strong>{receivedBy}</strong>
            </>
          )}
          {deliveryMethod === 'intermediary' && intermediaryName && (
            <>
              <span style={{ margin: '0 12px' }}>|</span>
              <span>Intermédiaire: </span>
              <strong>{intermediaryName}</strong>
            </>
          )}
          {deliveryMethod === 'bank_transfer' && bankTransferReference && (
            <>
              <span style={{ margin: '0 12px' }}>|</span>
              <span>Réf. virement: </span>
              <strong>{bankTransferReference}</strong>
            </>
          )}
        </p>
      )}

      {renderSimpleTable('CHEQUES', checks, checksAmount, [
        { header: 'N° Chèque', cell: (item) => item.check_number || '-' },
        { header: 'Banque', cell: (item) => item.check_bank || '-' },
      ])}

      {renderCashInvoice1Table()}

      {renderSimpleTable('VERSEMENT CASH', receiptCash, receiptCashTotal, [
        { header: 'N° Reçu', cell: (item) => item.receipt_number || '-' },
      ])}

      {renderSimpleTable('VERSEMENT DOC', receiptDocs, receiptsAmount, [
        { header: 'N° Reçu', cell: (item) => item.receipt_number || '-' },
      ])}

      {renderSimpleTable('VIREMENTS', transfers, transfersAmount, [
        { header: 'Référence', cell: (item) => item.transfer_reference || '-' },
      ])}

      <div className="mt-6 text-sm" data-pdf-section style={{ direction: 'ltr', textAlign: 'left' }}>
        <div className="mb-4 border-2 border-black p-3">
          <h3 className="mb-2 text-center text-base font-bold underline" style={{ textAlign: 'center' }}>ARGENT PHYSIQUE (ESPÈCES)</h3>
          {unifiedCash ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }} className="font-bold">
              <span>Espèces:</span>
              <span>{(cashInvoice1 + cashInvoice2).toLocaleString()} DA</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                <span>Espèces Facture 1:</span>
                <span className="font-bold">{cashItemsTotal.toLocaleString()} DA</span>
              </div>
              {receiptCashTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                  <span>Versement Cash:</span>
                  <span className="font-bold">{receiptCashTotal.toLocaleString()} DA</span>
                </div>
              )}
              {stampAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                  <span>Timbre Facture 1:</span>
                  <span className="font-bold">{stampAmount.toLocaleString()} DA</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                <span>Espèces Facture 2:</span>
                <span className="font-bold">{cashInvoice2.toLocaleString()} DA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid black' }} className="font-bold">
                <span>Total Espèces:</span>
                <span>{(cashInvoice1 + cashInvoice2).toLocaleString()} DA</span>
              </div>
            </>
          )}
        </div>

        {(checksAmount > 0 || receiptsAmount > 0 || transfersAmount > 0) && (
          <div className="mb-4 border-2 border-black p-3">
            <h3 className="mb-2 text-center text-base font-bold underline" style={{ textAlign: 'center' }}>VALEURS EN TRANSIT</h3>
            {checksAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                <span>Chèques:</span>
                <span className="font-bold">{checksAmount.toLocaleString()} DA</span>
              </div>
            )}
            {receiptsAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                <span>Versement Doc:</span>
                <span className="font-bold">{receiptsAmount.toLocaleString()} DA</span>
              </div>
            )}
            {transfersAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginBottom: '4px' }}>
                <span>Virements:</span>
                <span className="font-bold">{transfersAmount.toLocaleString()} DA</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid black' }} className="font-bold">
              <span>Total Valeurs:</span>
              <span>{(checksAmount + receiptsAmount + transfersAmount).toLocaleString()} DA</span>
            </div>
          </div>
        )}

        <div className="border-2 border-black p-3" style={{ backgroundColor: '#f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr' }} className="text-base font-bold">
            <span>TOTAL GÉNÉRAL:</span>
            <span>{totalAmount.toLocaleString()} DA</span>
          </div>
        </div>
      </div>

      <div className="mt-10" data-pdf-section style={{ textAlign: 'left' }}>
        <p className="font-bold underline">Signature:</p>
      </div>
    </div>
  );
};

export default HandoverPrintView;
