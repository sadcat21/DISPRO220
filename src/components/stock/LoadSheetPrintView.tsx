import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  sectorName: string | null;
  products: Record<string, number>; // productId -> quantity
}

const LoadSheetPrintView: React.FC<LoadSheetPrintViewProps> = ({
  open, onOpenChange, workerId, workerName, branchId
}) => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [customerRows, setCustomerRows] = useState<OrderRow[]>([]);
  const [productColumns, setProductColumns] = useState<{ id: string; name: string }[]>([]);
  const [surplusRow, setSurplusRow] = useState<Record<string, number>>({});
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !workerId) return;
    fetchData();
  }, [open, workerId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch active orders for this worker
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          id, customer_id,
          customer:customers(name, store_name, sector:sectors(name)),
          order_items(product_id, quantity, product:products(name))
        `)
        .eq('assigned_worker_id', workerId)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      // Fetch worker stock (what's loaded on truck)
      const { data: workerStock } = await supabase
        .from('worker_stock')
        .select('product_id, quantity, product:products(name)')
        .eq('worker_id', workerId)
        .gt('quantity', 0);

      // Build product set & customer rows
      const productMap = new Map<string, string>();
      const customerMap = new Map<string, OrderRow>();

      for (const order of (ordersData || [])) {
        const o = order as any;
        const custId = o.customer_id;
        const custName = o.customer?.name || '—';
        const storeName = o.customer?.store_name || null;
        const sectorName = o.customer?.sector?.name || null;

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            customerId: custId,
            customerName: custName,
            storeName,
            sectorName,
            products: {},
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

      // Also add products from worker stock that aren't in orders
      for (const ws of (workerStock || [])) {
        const w = ws as any;
        productMap.set(w.product_id, w.product?.name || '—');
      }

      const products = Array.from(productMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
      const rows = Array.from(customerMap.values());

      // Calculate surplus: worker stock - sum of all orders per product
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
        if (diff > 0) {
          surplus[w.product_id] = diff;
        }
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
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>ورقة الشحن - ${workerName}</title>
        <style>
          @page { size: landscape; margin: 8mm; }
          body { font-family: 'Cairo', 'Segoe UI', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 9pt; }
          .header { text-align: center; margin-bottom: 8px; }
          .header h1 { font-size: 14pt; margin: 0; }
          .header p { font-size: 10pt; margin: 2px 0; color: #555; }
          .header img { height: 40px; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #333; padding: 3px 5px; text-align: center; font-size: 8pt; }
          th { background: #f0f0f0; font-weight: bold; font-size: 7pt; }
          .customer-name { text-align: right; font-weight: 600; font-size: 8.5pt; white-space: nowrap; }
          .store-name { font-size: 7pt; color: #666; }
          .sector-name { font-size: 6.5pt; color: #999; }
          .surplus-row { background: #fff8e1; font-weight: bold; }
          .surplus-row td:first-child { text-align: right; color: #e65100; }
          .total-row { background: #e3f2fd; font-weight: bold; }
          .total-row td:first-child { text-align: right; }
          .qty-cell { font-weight: bold; font-size: 9pt; }
          .empty-cell { color: #ccc; }
          .loaded-row { background: #e8f5e9; font-weight: bold; }
          .loaded-row td:first-child { text-align: right; color: #2e7d32; }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  // Totals per product across all customers
  const productTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of customerRows) {
      for (const [pid, qty] of Object.entries(row.products)) {
        totals[pid] = (totals[pid] || 0) + qty;
      }
    }
    return totals;
  }, [customerRows]);

  // Grand total loaded (from surplus calculation base)
  const hasSurplus = Object.values(surplusRow).some(v => v > 0);
  const hasData = customerRows.length > 0 || hasSurplus;

  return (
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
                {/* Preview table */}
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border border-border p-1.5 text-right min-w-[120px]">العميل</th>
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
                        <td className="border border-border p-1.5 text-right">
                          <div className="font-semibold text-[11px]">{row.customerName}</div>
                          {row.storeName && <div className="text-[9px] text-muted-foreground">{row.storeName}</div>}
                          {row.sectorName && <div className="text-[8px] text-muted-foreground/70">{row.sectorName}</div>}
                        </td>
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
                    {/* Totals Row */}
                    <tr className="bg-blue-50 dark:bg-blue-950/30 font-bold">
                      <td className="border border-border p-1.5 text-right text-[11px]">
                        📦 إجمالي الطلبيات
                      </td>
                      {productColumns.map(p => (
                        <td key={p.id} className="border border-border p-1 text-center">
                          {productTotals[p.id] || '·'}
                        </td>
                      ))}
                    </tr>
                    {/* Surplus Row */}
                    {hasSurplus && (
                      <tr className="bg-amber-50 dark:bg-amber-950/30 font-bold">
                        <td className="border border-border p-1.5 text-right text-amber-700 dark:text-amber-400 text-[11px]">
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
                  </tbody>
                </table>
              </div>
            </ScrollArea>

            {/* Print-only content (hidden) */}
            <div style={{ display: 'none' }}>
              <div ref={printRef}>
                <div className="header">
                  <img src={logoImage} alt="" />
                  <h1>ورقة الشحن</h1>
                  <p><strong>{workerName}</strong> — {format(new Date(), 'dd/MM/yyyy')}</p>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', minWidth: '100px' }}>العميل</th>
                      {productColumns.map(p => (
                        <th key={p.id}>{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customerRows.map((row) => (
                      <tr key={row.customerId}>
                        <td className="customer-name">
                          {row.customerName}
                          {row.storeName && <span className="store-name"> ({row.storeName})</span>}
                          {row.sectorName && <div className="sector-name">{row.sectorName}</div>}
                        </td>
                        {productColumns.map(p => {
                          const qty = row.products[p.id] || 0;
                          return (
                            <td key={p.id} className={qty > 0 ? 'qty-cell' : 'empty-cell'}>
                              {qty > 0 ? qty : '·'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td>📦 إجمالي الطلبيات</td>
                      {productColumns.map(p => (
                        <td key={p.id}>{productTotals[p.id] || '·'}</td>
                      ))}
                    </tr>
                    {hasSurplus && (
                      <tr className="surplus-row">
                        <td>🏪 فائض للبيع المباشر</td>
                        {productColumns.map(p => {
                          const s = surplusRow[p.id] || 0;
                          return <td key={p.id}>{s > 0 ? Math.round(s * 100) / 100 : '·'}</td>;
                        })}
                      </tr>
                    )}
                    <tr className="loaded-row">
                      <td>🚛 إجمالي الشحن</td>
                      {productColumns.map(p => {
                        const total = (productTotals[p.id] || 0) + (surplusRow[p.id] || 0);
                        return <td key={p.id}>{total > 0 ? Math.round(total * 100) / 100 : '·'}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

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
  );
};

export default LoadSheetPrintView;
