import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Printer, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import OrdersPrintView from '@/components/print/OrdersPrintView';
import { OrderWithDetails, Product } from '@/types/database';

interface LoadSheetPrintViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  branchId: string | null;
}

const LoadSheetPrintView: React.FC<LoadSheetPrintViewProps> = ({
  open, onOpenChange, workerId, workerName, branchId
}) => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [orderItems, setOrderItems] = useState<Map<string, any[]>>(new Map());
  const [products, setProducts] = useState<Product[]>([]);
  const [isPrintReady, setIsPrintReady] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !workerId) return;
    fetchData();
  }, [open, workerId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch orders with full details (same structure OrdersPrintView expects)
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*, sector:sectors(name)),
          assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name),
          order_items(*, product:products(*))
        `)
        .eq('assigned_worker_id', workerId)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      const fetchedOrders = (ordersData || []) as unknown as OrderWithDetails[];
      
      // Build orderItems map and products list
      const itemsMap = new Map<string, any[]>();
      const productMap = new Map<string, Product>();

      for (const order of fetchedOrders) {
        const items = (order as any).order_items || [];
        itemsMap.set(order.id, items);
        for (const item of items) {
          if (item.product) {
            productMap.set(item.product_id, item.product as Product);
          }
        }
      }

      setOrders(fetchedOrders);
      setOrderItems(itemsMap);
      setProducts(Array.from(productMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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

  const hasData = orders.length > 0;

  return (
    <>
      {/* Reuse OrdersPrintView with custom title */}
      <OrdersPrintView
        ref={printRef}
        orders={orders}
        orderItems={orderItems}
        products={products}
        title={`ورقة الشحن - ${workerName}`}
        dateRange={format(new Date(), 'dd/MM/yyyy')}
        isVisible={isPrintReady}
      />

      <div className="print:hidden">
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
                          {products.map(p => (
                            <th key={p.id} className="border border-border p-1 text-center min-w-[50px] text-[10px]">
                              {p.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order, idx) => {
                          const items = orderItems.get(order.id) || [];
                          return (
                            <tr key={order.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                              <td className="border border-border p-1 text-center font-medium">{idx + 1}</td>
                              <td className="border border-border p-1.5 text-right">
                                <div className="font-semibold text-[11px]">{order.customer?.name || '—'}</div>
                              </td>
                              <td className="border border-border p-1.5 text-right text-[10px]">{order.customer?.store_name || ''}</td>
                              <td className="border border-border p-1.5 text-right text-[10px] direction-ltr">{order.customer?.phone || ''}</td>
                              <td className="border border-border p-1.5 text-right text-[10px]">{order.customer?.address || ''}</td>
                              {products.map(p => {
                                const item = items.find((i: any) => i.product_id === p.id);
                                const qty = item?.quantity || 0;
                                return (
                                  <td key={p.id} className={`border border-border p-1 text-center ${qty > 0 ? 'font-bold' : 'text-muted-foreground/30'}`}>
                                    {qty > 0 ? qty : '·'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{orders.length} عميل</Badge>
                    <Badge variant="secondary">{products.length} منتج</Badge>
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
      </div>
    </>
  );
};

export default LoadSheetPrintView;
