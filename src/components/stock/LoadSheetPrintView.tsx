import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Printer, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';

interface LoadSheetPrintViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  branchId: string | null;
}

interface OrderRow {
  customerId: string;
  customerName: string;
  storeName: string | null;
  phone: string | null;
  address: string | null;
  sectorName: string | null;
  products: Record<string, number>;
}

const LoadSheetPrintView: React.FC<LoadSheetPrintViewProps> = ({
  open, onOpenChange, workerId, workerName, branchId
}) => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [customerRows, setCustomerRows] = useState<OrderRow[]>([]);
  const [productColumns, setProductColumns] = useState<{ id: string; name: string }[]>([]);
  const [surplusRow, setSurplusRow] = useState<Record<string, number>>({});
  const [isPrintReady, setIsPrintReady] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Portal container for print
  const [printContainer, setPrintContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const div = document.createElement('div');
    div.id = 'loadsheet-print-portal';
    document.body.appendChild(div);
    setPrintContainer(div);
    return () => { document.body.removeChild(div); };
  }, []);

  useEffect(() => {
    if (!open || !workerId) return;
    fetchData();
  }, [open, workerId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          id, customer_id,
          customer:customers(name, store_name, phone, address, sector:sectors(name)),
          order_items(product_id, quantity, product:products(name))
        `)
        .eq('assigned_worker_id', workerId)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      const { data: workerStock } = await supabase
        .from('worker_stock')
        .select('product_id, quantity, product:products(name)')
        .eq('worker_id', workerId)
        .gt('quantity', 0);

      const productMap = new Map<string, string>();
      const customerMap = new Map<string, OrderRow>();

      for (const order of (ordersData || [])) {
        const o = order as any;
        const custId = o.customer_id;
        const custName = o.customer?.name || '—';
        const storeName = o.customer?.store_name || null;
        const phone = o.customer?.phone || null;
        const address = o.customer?.address || null;
        const sectorName = o.customer?.sector?.name || null;

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            customerId: custId, customerName: custName,
            storeName, phone, address, sectorName, products: {},
          });
        }

        const row = customerMap.get(custId)!;
        for (const item of (o.order_items || [])) {
          const prodId = item.product_id;
          const prodName = (item.product as any)?.name || '—';
          productMap.set(prodId, prodName);
          row.products[prodId] = (row.products[prodId] || 0) + (item.quantity || 0);
        }
      }

      for (const ws of (workerStock || [])) {
        const w = ws as any;
        productMap.set(w.product_id, w.product?.name || '—');
      }

      const products = Array.from(productMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
      const rows = Array.from(customerMap.values());

      const orderTotals: Record<string, number> = {};
      for (const row of rows) {
        for (const [pid, qty] of Object.entries(row.products)) {
          orderTotals[pid] = (orderTotals[pid] || 0) + qty;
        }
      }

      const surplus: Record<string, number> = {};
      for (const ws of (workerStock || [])) {
        const w = ws as any;
        const loaded = w.quantity || 0;
        const ordered = orderTotals[w.product_id] || 0;
        const diff = Math.round((loaded - ordered) * 100) / 100;
        if (diff > 0) surplus[w.product_id] = diff;
      }

      setProductColumns(products);
      setCustomerRows(rows);
      setSurplusRow(surplus);
    } catch (err) {
      console.error('Error fetching load sheet data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    setIsPrintReady(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrintReady(false), 500);
    }, 300);
  };

  const productTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of customerRows) {
      for (const [pid, qty] of Object.entries(row.products)) {
        totals[pid] = (totals[pid] || 0) + qty;
      }
    }
    return totals;
  }, [customerRows]);

  const hasSurplus = Object.values(surplusRow).some(v => v > 0);
  const hasData = customerRows.length > 0 || hasSurplus;

  // Number of static columns (before products) for colspan in totals
  const staticColCount = 5; // رقم, العميل, اسم المحل, الهاتف, العنوان

  // Print content rendered via portal (identical to OrdersPrintView)
  const printContent = printContainer ? createPortal(
    <div
      ref={printRef}
      className="print-container"
      dir="rtl"
      style={{ display: isPrintReady ? 'block' : 'none', position: 'relative' }}
    >
      {/* Watermark */}
      <div style={{
        position: 'fixed', top: '45%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 0,
        opacity: 0.2, pointerEvents: 'none'
      }}>
        <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
      </div>

      {/* Header with Logo - identical to OrdersPrintView */}
      <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
        <div className="print-logo">
          <img src={logoImage} alt="Laser Food" />
        </div>
        <div className="print-title-section">
          <h1>ورقة الشحن</h1>
          <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '5px' }}>
            {workerName} — {format(new Date(), 'dd/MM/yyyy')}
          </p>
        </div>
        <div className="print-logo">
          <img src={logoImage} alt="Laser Food" />
        </div>
      </div>

      {/* Table - identical structure to OrdersPrintView */}
      <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
        <thead>
          <tr>
            <th style={{ width: '30px' }}>الرقم</th>
            <th>العميل</th>
            <th>اسم المحل</th>
            <th style={{ width: '90px' }}>الهاتف</th>
            <th>العنوان</th>
            {productColumns.map(p => (
              <th key={p.id} style={{ width: '55px', fontSize: '8pt', lineHeight: '1.2' }}>
                <div>{p.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customerRows.map((row, index) => (
            <tr key={row.customerId}>
              <td className="center">{index + 1}</td>
              <td>
                <div>{row.customerName}</div>
                {row.sectorName && (
                  <div style={{ fontSize: '6pt', opacity: 0.5, borderTop: '1px dotted #ddd', marginTop: '1px', paddingTop: '1px' }}>
                    {row.sectorName}
                  </div>
                )}
              </td>
              <td className="small-text">{row.storeName || ''}</td>
              <td className="ltr-text">{row.phone || ''}</td>
              <td className="small-text">{row.address || ''}</td>
              {productColumns.map(p => {
                const qty = row.products[p.id] || 0;
                return (
                  <td key={p.id} className="center" style={{ padding: '2px 1px' }}>
                    {qty > 0 && (
                      <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>{qty}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Totals row - identical style to OrdersPrintView */}
          <tr className="totals-row">
            <td colSpan={staticColCount} className="totals-label">📦 إجمالي الطلبيات</td>
            {productColumns.map(p => (
              <td key={p.id} className="center bold">
                {productTotals[p.id] > 0 ? productTotals[p.id] : ''}
              </td>
            ))}
          </tr>

          {/* Surplus row */}
          {hasSurplus && (
            <tr style={{ backgroundColor: '#fff8e1', fontWeight: 'bold' }}>
              <td colSpan={staticColCount} style={{ textAlign: 'right', color: '#e65100', padding: '4px 8px', fontSize: '9pt' }}>
                🏪 فائض للبيع المباشر
              </td>
              {productColumns.map(p => {
                const s = surplusRow[p.id] || 0;
                return (
                  <td key={p.id} className="center" style={{ color: s > 0 ? '#e65100' : undefined, fontWeight: 'bold', fontSize: '9pt' }}>
                    {s > 0 ? Math.round(s * 100) / 100 : ''}
                  </td>
                );
              })}
            </tr>
          )}

          {/* Loaded total row */}
          <tr style={{ backgroundColor: '#e8f5e9', fontWeight: 'bold' }}>
            <td colSpan={staticColCount} style={{ textAlign: 'right', color: '#2e7d32', padding: '4px 8px', fontSize: '9pt' }}>
              🚛 إجمالي الشحن
            </td>
            {productColumns.map(p => {
              const total = (productTotals[p.id] || 0) + (surplusRow[p.id] || 0);
              return (
                <td key={p.id} className="center" style={{ color: '#2e7d32', fontWeight: 'bold', fontSize: '9pt' }}>
                  {total > 0 ? Math.round(total * 100) / 100 : ''}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* Footer - identical to OrdersPrintView */}
      <div className="print-footer" style={{ marginTop: '10px' }}>
        <span>تاريخ الطباعة: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
        <span>عدد العملاء: {customerRows.length}</span>
        <span>Laser Food</span>
      </div>
    </div>,
    printContainer
  ) : null;

  return (
    <>
      {printContent}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Printer className="w-4 h-4" />
              ورقة الشحن - {workerName}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !hasData ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              <p>لا توجد طلبيات نشطة لهذا العامل</p>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[65vh]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border p-1.5 text-center w-[30px]">الرقم</th>
                        <th className="border border-border p-1.5 text-right min-w-[100px]">العميل</th>
                        <th className="border border-border p-1.5 text-right min-w-[80px]">اسم المحل</th>
                        <th className="border border-border p-1.5 text-right min-w-[80px]">الهاتف</th>
                        <th className="border border-border p-1.5 text-right min-w-[80px]">العنوان</th>
                        {productColumns.map(p => (
                          <th key={p.id} className="border border-border p-1 text-center min-w-[50px] text-[10px]">
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customerRows.map((row, idx) => (
                        <tr key={row.customerId} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                          <td className="border border-border p-1 text-center font-medium">{idx + 1}</td>
                          <td className="border border-border p-1.5 text-right">
                            <div className="font-semibold text-[11px]">{row.customerName}</div>
                            {row.sectorName && <div className="text-[8px] text-muted-foreground/70">{row.sectorName}</div>}
                          </td>
                          <td className="border border-border p-1.5 text-right text-[10px]">{row.storeName || ''}</td>
                          <td className="border border-border p-1.5 text-right text-[10px] direction-ltr">{row.phone || ''}</td>
                          <td className="border border-border p-1.5 text-right text-[10px]">{row.address || ''}</td>
                          {productColumns.map(p => {
                            const qty = row.products[p.id] || 0;
                            return (
                              <td key={p.id} className={`border border-border p-1 text-center ${qty > 0 ? 'font-bold' : 'text-muted-foreground/30'}`}>
                                {qty > 0 ? qty : '·'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="bg-blue-50 dark:bg-blue-950/30 font-bold">
                        <td colSpan={staticColCount} className="border border-border p-1.5 text-right text-[11px]">
                          📦 إجمالي الطلبيات
                        </td>
                        {productColumns.map(p => (
                          <td key={p.id} className="border border-border p-1 text-center">
                            {productTotals[p.id] || '·'}
                          </td>
                        ))}
                      </tr>
                      {hasSurplus && (
                        <tr className="bg-amber-50 dark:bg-amber-950/30 font-bold">
                          <td colSpan={staticColCount} className="border border-border p-1.5 text-right text-amber-700 dark:text-amber-400 text-[11px]">
                            🏪 فائض للبيع المباشر
                          </td>
                          {productColumns.map(p => {
                            const s = surplusRow[p.id] || 0;
                            return (
                              <td key={p.id} className={`border border-border p-1 text-center ${s > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground/30'}`}>
                                {s > 0 ? Math.round(s * 100) / 100 : '·'}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      <tr className="bg-green-50 dark:bg-green-950/30 font-bold">
                        <td colSpan={staticColCount} className="border border-border p-1.5 text-right text-green-700 dark:text-green-400 text-[11px]">
                          🚛 إجمالي الشحن
                        </td>
                        {productColumns.map(p => {
                          const total = (productTotals[p.id] || 0) + (surplusRow[p.id] || 0);
                          return (
                            <td key={p.id} className="border border-border p-1 text-center text-green-700 dark:text-green-400">
                              {total > 0 ? Math.round(total * 100) / 100 : '·'}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </ScrollArea>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{customerRows.length} عميل</Badge>
                  <Badge variant="secondary">{productColumns.length} منتج</Badge>
                </div>
                <Button onClick={handlePrint} className="gap-2">
                  <Printer className="w-4 h-4" />
                  طباعة ورقة الشحن
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LoadSheetPrintView;
