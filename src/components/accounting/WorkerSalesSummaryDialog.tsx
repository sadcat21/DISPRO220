import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingBag, Package, User, Clock, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

interface CustomerBreakdown {
  customerId: string;
  customerName: string;
  quantity: number;
  giftQuantity: number;
  totalAmount: number;
}

interface ProductAgg {
  productId: string;
  name: string;
  quantity: number;
  giftQuantity: number;
  totalAmount: number;
  piecesPerBox: number | null;
  imageUrl: string | null;
  customers: CustomerBreakdown[];
}

/** Carousel view for expanded product with customer overlay */
const ExpandedCarousel: React.FC<{
  items: ProductAgg[];
  expandedProduct: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}> = ({ items, expandedProduct, onNavigate, onClose }) => {
  const currentIdx = items.findIndex(i => i.productId === expandedProduct);
  const item = items[currentIdx];
  if (!item) return null;

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIdx > 0) onNavigate(items[currentIdx - 1].productId);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIdx < items.length - 1) onNavigate(items[currentIdx + 1].productId);
  };

  return (
    <div className="flex flex-col gap-2 pb-2">
      {/* Navigation header */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={goPrev}
          disabled={currentIdx === 0}
          className="p-1 rounded-full bg-muted hover:bg-primary/10 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <span className="text-xs text-muted-foreground">
          {currentIdx + 1} / {items.length}
        </span>
        <button
          onClick={goNext}
          disabled={currentIdx === items.length - 1}
          className="p-1 rounded-full bg-muted hover:bg-primary/10 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Large product card */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden shadow-lg border-2 border-primary ring-2 ring-primary/30 cursor-pointer"
        onClick={onClose}
      >
        {/* Product name */}
        <div className="px-3 py-2 border-b text-center bg-primary border-primary">
          <span className="font-bold text-sm block truncate text-primary-foreground">
            {item.name}
          </span>
        </div>

        {/* Large image with customer overlay */}
        <div className="relative w-full aspect-[3/4] overflow-hidden bg-muted">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <Package className="w-16 h-16 text-primary/30" />
            </div>
          )}

          {item.customers.length > 0 && (
            <>
              <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px]" />
              <div className="absolute inset-0 z-10 p-3 overflow-y-auto space-y-1.5">
                {item.customers.map((c) => (
                  <div
                    key={c.customerId}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-card/80 border border-border/60 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{c.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-primary text-base">{c.quantity}</span>
                      {c.giftQuantity > 0 && (
                        <span className="text-xs text-muted-foreground">(+{c.giftQuantity})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-card flex items-center justify-between">
          <span className="font-bold text-base text-primary">{item.quantity}</span>
          <span className="text-xs text-muted-foreground">{item.totalAmount.toLocaleString('ar-DZ')} د.ج</span>
        </div>
        {item.giftQuantity > 0 && (
          <div className="px-3 pb-1.5 bg-card text-center">
            <span className="text-xs text-muted-foreground">هدايا: {item.giftQuantity}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const WorkerSalesSummaryDialog: React.FC<Props> = ({ open, onOpenChange, workerId, workerName }) => {
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useRealtimeSubscription(
    `worker-sales-realtime-${workerId}`,
    [
      { table: 'orders' },
      { table: 'order_items' },
    ],
    [['worker-sales-summary', workerId], ['worker-last-accounting-sales', workerId]],
    open && !!workerId
  );

  const { data: lastAccounting } = useQuery({
    queryKey: ['worker-last-accounting-sales', workerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounting_sessions')
        .select('completed_at')
        .eq('worker_id', workerId!)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();
      return data?.completed_at || null;
    },
    enabled: open && !!workerId,
  });

  const { data: salesData, isLoading } = useQuery({
    queryKey: ['worker-sales-summary', workerId, lastAccounting],
    queryFn: async () => {
      let ordersQuery = supabase
        .from('orders')
        .select('id, status, payment_type, created_at, updated_at, customer_id')
        .in('status', ['delivered', 'completed', 'confirmed'])
        .or(`assigned_worker_id.eq.${workerId!},created_by.eq.${workerId!}`);

      if (lastAccounting) {
        ordersQuery = ordersQuery.gte('updated_at', lastAccounting);
      }

      const { data: orders, error } = await ordersQuery;
      if (error) throw error;
      if (!orders || orders.length === 0) return { items: [], orderCount: 0, firstOrderTime: null, lastOrderTime: null };

      const orderIds = orders.map(o => o.id);
      const orderCustomerMap = new Map(orders.map(o => [o.id, o.customer_id]));

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('order_id, product_id, quantity, gift_quantity, unit_price, total_price')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      const productIds = [...new Set((items || []).map(i => i.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, name, pieces_per_box, image_url')
        .in('id', productIds);

      const productMap = new Map((products || []).map(p => [p.id, p]));

      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const { data: customers } = customerIds.length > 0
        ? await supabase.from('customers').select('id, name').in('id', customerIds)
        : { data: [] };
      const customerMap = new Map((customers || []).map(c => [c.id, c.name]));

      const agg: Record<string, ProductAgg> = {};

      for (const item of (items || [])) {
        const customerId = orderCustomerMap.get(item.order_id) || 'unknown';
        if (!agg[item.product_id]) {
          const product = productMap.get(item.product_id);
          agg[item.product_id] = {
            productId: item.product_id,
            name: product?.name || 'منتج غير معروف',
            quantity: 0,
            giftQuantity: 0,
            totalAmount: 0,
            piecesPerBox: product?.pieces_per_box || null,
            imageUrl: product?.image_url || null,
            customers: [],
          };
        }
        agg[item.product_id].quantity += item.quantity || 0;
        agg[item.product_id].giftQuantity += item.gift_quantity || 0;
        agg[item.product_id].totalAmount += item.total_price || 0;

        const existing = agg[item.product_id].customers.find(c => c.customerId === customerId);
        if (existing) {
          existing.quantity += item.quantity || 0;
          existing.giftQuantity += item.gift_quantity || 0;
          existing.totalAmount += item.total_price || 0;
        } else {
          agg[item.product_id].customers.push({
            customerId,
            customerName: customerMap.get(customerId) || 'عميل غير معروف',
            quantity: item.quantity || 0,
            giftQuantity: item.gift_quantity || 0,
            totalAmount: item.total_price || 0,
          });
        }
      }

      for (const p of Object.values(agg)) {
        p.customers.sort((a, b) => b.quantity - a.quantity);
      }

      const createdTimes = orders.map(o => new Date(o.created_at).getTime());
      const updatedTimes = orders.map(o => new Date(o.updated_at).getTime());
      const firstOrderTime = createdTimes.length ? new Date(Math.min(...createdTimes)).toISOString() : null;
      const lastOrderTime = updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null;

      return {
        items: Object.values(agg).sort((a, b) => b.quantity - a.quantity),
        orderCount: orders.length,
        firstOrderTime,
        lastOrderTime,
      };
    },
    enabled: open && !!workerId,
    refetchInterval: open ? 15000 : false,
    refetchOnWindowFocus: true,
  });

  const totalAmount = useMemo(() => {
    return (salesData?.items || []).reduce((s, i) => s + i.totalAmount, 0);
  }, [salesData]);

  const totalQty = useMemo(() => {
    return (salesData?.items || []).reduce((s, i) => s + i.quantity, 0);
  }, [salesData]);

  const firstTime = salesData?.firstOrderTime ? new Date(salesData.firstOrderTime) : null;
  const lastTime = salesData?.lastOrderTime ? new Date(salesData.lastOrderTime) : null;
  const todayDate = new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              تجميع مبيعات {workerName}
            </div>
            <div className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>{todayDate}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Combined stats + time row */}
        <div className="flex flex-wrap gap-1.5 items-center text-xs">
          <Badge variant="secondary" className="text-xs">
            {salesData?.orderCount || 0} طلبية
          </Badge>
          <Badge variant="outline" className="text-xs">
            {totalQty} وحدة
          </Badge>
          <Badge className="text-xs bg-primary/10 text-primary border-0">
            {totalAmount.toLocaleString('ar-DZ')} د.ج
          </Badge>
          {lastAccounting && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              منذ آخر محاسبة
            </Badge>
          )}
          {firstTime && (
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-[hsl(var(--success)/0.18)] text-[hsl(var(--success-foreground))] font-semibold text-[11px]">
              <Clock className="w-3 h-3" />
              {firstTime.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {lastTime && (
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-destructive/15 text-destructive font-semibold text-[11px]">
              <Clock className="w-3 h-3" />
              {lastTime.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : !salesData?.items.length ? (
            <div className="py-10 text-center text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>لا توجد مبيعات في هذه الفترة</p>
            </div>
          ) : expandedProduct ? (
            <ExpandedCarousel
              items={salesData.items}
              expandedProduct={expandedProduct}
              onNavigate={setExpandedProduct}
              onClose={() => setExpandedProduct(null)}
            />
          ) : (
            <div className="grid grid-cols-3 gap-2 pb-2">
              {salesData.items.map((item) => (
                <div
                  key={item.productId}
                  className="flex flex-col rounded-2xl overflow-hidden shadow-lg border-2 border-border hover:border-primary/50 cursor-pointer active:scale-[0.97] transition-all"
                  onClick={() => setExpandedProduct(item.productId)}
                >
                  <div className="px-2 py-1.5 border-b text-center bg-muted border-border">
                    <span className="font-bold text-xs leading-tight block truncate text-foreground">
                      {item.name}
                    </span>
                  </div>
                  <div className="w-full aspect-square bg-muted overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-10 h-10 text-primary/30" />
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-1.5 bg-card flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary/10 text-primary py-1 text-xs font-bold">
                        <Package className="w-3 h-3" />
                        {item.quantity}
                      </div>
                      {item.giftQuantity > 0 && (
                        <div className="flex items-center justify-center gap-0.5 rounded-md bg-secondary py-1 px-1.5 text-[10px] font-semibold text-secondary-foreground">
                          🎁 {item.giftQuantity}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-center rounded-md bg-muted py-1 text-[10px] font-semibold text-muted-foreground">
                      {item.totalAmount.toLocaleString('ar-DZ')} د.ج
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerSalesSummaryDialog;
