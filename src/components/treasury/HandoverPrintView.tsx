import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface HandoverItem {
  order_id: string;
  payment_method: string;
  amount: number;
  customer_name: string | null;
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
  onReady?: () => void;
}

const HandoverPrintView: React.FC<Props> = ({
  handoverId, handoverDate, cashInvoice1, cashInvoice2,
  checksAmount, receiptsAmount, transfersAmount, totalAmount, branchName, onReady
}) => {
  const [items, setItems] = useState<HandoverItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      const { data } = await supabase
        .from('handover_items')
        .select('order_id, payment_method, amount, customer_name, treasury_entry_id')
        .eq('handover_id', handoverId);

      if (!data?.length) { setLoading(false); onReady?.(); return; }

      // Try to get extra details from manager_treasury entries
      const treasuryIds = data.filter(d => d.treasury_entry_id).map(d => d.treasury_entry_id);
      let treasuryMap: Record<string, any> = {};
      if (treasuryIds.length > 0) {
        const { data: tEntries } = await supabase
          .from('manager_treasury')
          .select('id, invoice_number, invoice_date, check_number, check_date, check_bank, receipt_number, transfer_reference')
          .in('id', treasuryIds);
        (tEntries || []).forEach(e => { treasuryMap[e.id] = e; });
      }

      // Get order details for dates and French customer names
      const orderIds = data.map(d => d.order_id).filter(Boolean);
      let orderMap: Record<string, any> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, created_at, delivery_date, total_amount, customer_id, customers(name_fr, name, store_name_fr, store_name)')
          .in('id', orderIds);
        (orders || []).forEach(o => { orderMap[o.id] = o; });
      }

      const enriched: HandoverItem[] = data.map(d => {
        const t = d.treasury_entry_id ? treasuryMap[d.treasury_entry_id] : null;
        const order = d.order_id ? orderMap[d.order_id] : null;
        const customer = order?.customers;
        const customerNameFr = customer?.store_name_fr || customer?.name_fr || customer?.store_name || customer?.name || d.customer_name;
        return {
          ...d,
          customer_name: customerNameFr || d.customer_name,
          invoice_number: t?.invoice_number || undefined,
          invoice_date: t?.invoice_date || (order ? format(new Date(order.delivery_date || order.created_at), 'dd/MM/yyyy') : undefined),
          check_number: t?.check_number || undefined,
          check_date: t?.check_date || undefined,
          check_bank: t?.check_bank || undefined,
          receipt_number: t?.receipt_number || undefined,
          transfer_reference: t?.transfer_reference || undefined,
        };
      });

      setItems(enriched);
      setLoading(false);
      setTimeout(() => onReady?.(), 100);
    };
    fetchItems();
  }, [handoverId]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const checks = items.filter(i => i.payment_method === 'check');
  const receipts = items.filter(i => i.payment_method === 'receipt');
  const transfers = items.filter(i => i.payment_method === 'transfer');
  const dateStr = format(new Date(handoverDate), 'dd/MM/yyyy');

  return (
    <div className="print-handover bg-white text-black p-8 font-sans" style={{ direction: 'ltr', fontSize: '12px' }}>
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-lg font-bold">{branchName || 'BORDEREAU D\'ENVOI'}</h1>
        <h2 className="text-base font-bold mt-1">BORDEREAU D'ENVOI</h2>
      </div>

      <p className="mb-4"><strong>Date d'envoi:</strong> {dateStr}</p>

      {/* Checks Table */}
      {checks.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold text-sm mb-1">CHEQUES ({checks.length})</h3>
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr>
                <th className="border border-black p-1 text-left">Client</th>
                <th className="border border-black p-1 text-left">N° Facture</th>
                <th className="border border-black p-1 text-right">Montant</th>
                <th className="border border-black p-1 text-left">N° Chèque</th>
                <th className="border border-black p-1 text-left">Banque</th>
                <th className="border border-black p-1 text-left">Date Chèque</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((item, i) => (
                <tr key={i}>
                  <td className="border border-black p-1">{item.customer_name || '-'}</td>
                  <td className="border border-black p-1">{item.invoice_number || '-'}</td>
                  <td className="border border-black p-1 text-right">{item.amount.toLocaleString()}</td>
                  <td className="border border-black p-1">{item.check_number || '-'}</td>
                  <td className="border border-black p-1">{item.check_bank || '-'}</td>
                  <td className="border border-black p-1">{item.check_date || '-'}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-black p-1" colSpan={2}>Total Chèques</td>
                <td className="border border-black p-1 text-right">{checksAmount.toLocaleString()}</td>
                <td className="border border-black p-1" colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Versement (Bank Receipt) Table */}
      {receipts.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold text-sm mb-1">VERSEMENTS ({receipts.length})</h3>
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr>
                <th className="border border-black p-1 text-left">Client</th>
                <th className="border border-black p-1 text-left">N° Facture</th>
                <th className="border border-black p-1 text-right">Montant</th>
                <th className="border border-black p-1 text-left">N° Reçu</th>
                <th className="border border-black p-1 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((item, i) => (
                <tr key={i}>
                  <td className="border border-black p-1">{item.customer_name || '-'}</td>
                  <td className="border border-black p-1">{item.invoice_number || '-'}</td>
                  <td className="border border-black p-1 text-right">{item.amount.toLocaleString()}</td>
                  <td className="border border-black p-1">{item.receipt_number || '-'}</td>
                  <td className="border border-black p-1">{item.invoice_date || '-'}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-black p-1" colSpan={2}>Total Versements</td>
                <td className="border border-black p-1 text-right">{receiptsAmount.toLocaleString()}</td>
                <td className="border border-black p-1" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Virement (Bank Transfer) Table */}
      {transfers.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold text-sm mb-1">VIREMENTS ({transfers.length})</h3>
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr>
                <th className="border border-black p-1 text-left">Client</th>
                <th className="border border-black p-1 text-left">N° Facture</th>
                <th className="border border-black p-1 text-right">Montant</th>
                <th className="border border-black p-1 text-left">Référence</th>
                <th className="border border-black p-1 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((item, i) => (
                <tr key={i}>
                  <td className="border border-black p-1">{item.customer_name || '-'}</td>
                  <td className="border border-black p-1">{item.invoice_number || '-'}</td>
                  <td className="border border-black p-1 text-right">{item.amount.toLocaleString()}</td>
                  <td className="border border-black p-1">{item.transfer_reference || '-'}</td>
                  <td className="border border-black p-1">{item.invoice_date || '-'}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-black p-1" colSpan={2}>Total Virements</td>
                <td className="border border-black p-1 text-right">{transfersAmount.toLocaleString()}</td>
                <td className="border border-black p-1" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Footer */}
      <div className="mt-6 border-t border-black pt-3 text-sm">
        <div className="flex justify-between mb-1">
          <span>ARGENT FACTURES (Cash F1):</span>
          <span className="font-bold">{cashInvoice1.toLocaleString()} DA</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>ARGENT SANS FACTURE (Cash F2):</span>
          <span className="font-bold">{cashInvoice2.toLocaleString()} DA</span>
        </div>
        {checksAmount > 0 && (
          <div className="flex justify-between mb-1">
            <span>CHEQUES:</span>
            <span className="font-bold">{checksAmount.toLocaleString()} DA</span>
          </div>
        )}
        {receiptsAmount > 0 && (
          <div className="flex justify-between mb-1">
            <span>VERSEMENTS:</span>
            <span className="font-bold">{receiptsAmount.toLocaleString()} DA</span>
          </div>
        )}
        {transfersAmount > 0 && (
          <div className="flex justify-between mb-1">
            <span>VIREMENTS:</span>
            <span className="font-bold">{transfersAmount.toLocaleString()} DA</span>
          </div>
        )}
        <div className="flex justify-between mt-2 pt-2 border-t border-black text-base font-bold">
          <span>TOTAL:</span>
          <span>{totalAmount.toLocaleString()} DA</span>
        </div>
      </div>

      {/* Signature */}
      <div className="mt-10">
        <p className="font-bold underline">Signature:</p>
      </div>
    </div>
  );
};

export default HandoverPrintView;
