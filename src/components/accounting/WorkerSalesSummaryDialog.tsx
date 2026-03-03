import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingBag, Package, ChevronDown, ChevronUp, User, Clock, Calendar } from 'lucide-react';
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
  customers: CustomerBreakdown[];
}

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

      // Build order->customer map
      const orderCustomerMap = new Map(orders.map(o => [o.id, o.customer_id]));

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('order_id, product_id, quantity, gift_quantity, unit_price, total_price')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      // Fetch product names
      const productIds = [...new Set((items || []).map(i => i.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, name, pieces_per_box')
        .in('id', productIds);

      const productMap = new Map((products || []).map(p => [p.id, p]));

      // Fetch customer names
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const { data: customers } = customerIds.length > 0
        ? await supabase.from('customers').select('id, name').in('id', customerIds)
        : { data: [] };
      const customerMap = new Map((customers || []).map(c => [c.id, c.name]));

      // Aggregate per product with customer breakdown
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
            customers: [],
          };
        }
        agg[item.product_id].quantity += item.quantity || 0;
        agg[item.product_id].giftQuantity += item.gift_quantity || 0;
        agg[item.product_id].totalAmount += item.total_price || 0;

        // Customer breakdown
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

      // Sort customers inside each product by quantity desc
      for (const p of Object.values(agg)) {
        p.customers.sort((a, b) => b.quantity - a.quantity);
      }

      // Get first and last order times
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

  const firstTime = salesData?.firstOrderTime ? new Date(salesData.firstOrderTime) : null;
  const lastTime = salesData?.lastOrderTime ? new Date(salesData.lastOrderTime) : null;
  const todayDate = new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' });

  const totalQty = useMemo(() => {
    return (salesData?.items || []).reduce((s, i) => s + i.quantity, 0);
  }, [salesData]);

  const toggleProduct = (productId: string) => {
    setExpandedProduct(prev => prev === productId ? null : productId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            تجميع مبيعات {workerName}
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">
            {salesData?.orderCount || 0} طلبية
          </Badge>
          <Badge variant="outline" className="text-xs">
            {totalQty} وحدة مباعة
          </Badge>
          <Badge className="text-xs bg-primary/10 text-primary border-0">
            {totalAmount.toLocaleString('ar-DZ')} د.ج
          </Badge>
          {lastAccounting && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              منذ آخر محاسبة
            </Badge>
          )}
        </div>

        {/* Date and time info */}
        <div className="flex items-center justify-between text-xs px-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{todayDate}</span>
          </div>
          <div className="flex items-center gap-2">
            {firstTime && (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <Clock className="w-3 h-3" />
                {firstTime.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {lastTime && (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <Clock className="w-3 h-3" />
                {lastTime.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
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
          ) : (
            <div className="space-y-2 pb-2">
              {salesData.items.map((item) => {
                const isExpanded = expandedProduct === item.productId;
                return (
                  <div key={item.productId}>
                    <div
                      className="flex items-center justify-between p-3 rounded-lg border bg-card cursor-pointer active:scale-[0.98] transition-all"
                      onClick={() => toggleProduct(item.productId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          {item.giftQuantity > 0 && (
                            <p className="text-[10px] text-muted-foreground">هدايا: {item.giftQuantity}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-left">
                          <p className="font-bold text-sm text-primary">{item.quantity}</p>
                          <p className="text-[10px] text-muted-foreground">{item.totalAmount.toLocaleString('ar-DZ')} د.ج</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Customer breakdown */}
                    {isExpanded && item.customers.length > 0 && (
                      <div className="mr-4 mt-1 space-y-1 border-r-2 border-primary/20 pr-3">
                        {item.customers.map((c) => (
                          <div
                            key={c.customerId}
                            className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50 text-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{c.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-primary">{c.quantity}</span>
                              {c.giftQuantity > 0 && (
                                <span className="text-[10px] text-muted-foreground">(+{c.giftQuantity})</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerSalesSummaryDialog;
