import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Printer, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
  open,
  onOpenChange,
  workerId,
  workerName,
  branchId,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [orderItems, setOrderItems] = useState<Map<string, any[]>>(new Map());
  const [products, setProducts] = useState<Product[]>([]);
  const [isPrintReady, setIsPrintReady] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);

  const printRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !workerId) return;
    fetchData();
  }, [open, workerId]);

  useEffect(() => {
    if (!open || orders.length === 0) return;

    const updateScale = () => {
      const viewportWidth = previewViewportRef.current?.clientWidth || 0;
      const contentWidth = previewContentRef.current?.scrollWidth || 0;
      if (!viewportWidth || !contentWidth) return;

      const fitScale = Math.min(1, viewportWidth / contentWidth);
      setPreviewScale(fitScale > 0 ? fitScale : 1);
    };

    const raf = requestAnimationFrame(updateScale);
    window.addEventListener('resize', updateScale);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && previewViewportRef.current) {
      resizeObserver = new ResizeObserver(updateScale);
      resizeObserver.observe(previewViewportRef.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateScale);
      resizeObserver?.disconnect();
    };
  }, [open, orders.length, products.length]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
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
  const title = `ورقة الشحن - ${workerName}`;
  const printDate = format(new Date(), 'dd/MM/yyyy');

  return (
    <>
      {isPrintReady && (
        <OrdersPrintView
          ref={printRef}
          orders={orders}
          orderItems={orderItems}
          products={products}
          title={title}
          dateRange={printDate}
          isVisible
        />
      )}

      <div className="print:hidden">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-hidden" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Printer className="w-4 h-4" />
                {title}
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
                <ScrollArea className="max-h-[68vh] rounded-md border border-border">
                  <div ref={previewViewportRef} className="print-preview-surface overflow-auto p-3 bg-background">
                    <div className="flex justify-center">
                      <div
                        className="origin-top-right"
                        style={{
                          transform: `scale(${previewScale})`,
                          width: `${100 / previewScale}%`,
                        }}
                      >
                        <div ref={previewContentRef}>
                          <OrdersPrintView
                            orders={orders}
                            orderItems={orderItems}
                            products={products}
                            title={title}
                            dateRange={printDate}
                            isVisible
                            usePortal={false}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                <div className="flex items-center justify-end pt-2">
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
