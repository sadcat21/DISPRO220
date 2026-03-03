import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingBag, Package } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

const WorkerSalesSummaryDialog: React.FC<Props> = ({ open, onOpenChange, workerId, workerName }) => {
  // Realtime subscription for orders and order_items
  useRealtimeSubscription(
    `worker-sales-realtime-${workerId}`,
    [
      { table: 'orders' },
      { table: 'order_items' },
    ],
    [['worker-sales-summary', workerId], ['worker-last-accounting-sales', workerId]],
    open && !!workerId
  );

  // Fetch last completed accounting session
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

  // Fetch all delivered/completed orders since last accounting
  const { data: salesData, isLoading } = useQuery({
    queryKey: ['worker-sales-summary', workerId, lastAccounting],
    queryFn: async () => {
      let ordersQuery = supabase
        .from('orders')
        .select('id, status, payment_type, created_at, updated_at')
        .in('status', ['delivered', 'completed', 'confirmed'])
        .or(`assigned_worker_id.eq.${workerId!},created_by.eq.${workerId!}`);

      if (lastAccounting) {
        ordersQuery = ordersQuery.gte('updated_at', lastAccounting);
      }

      const { data: orders, error } = await ordersQuery;
      if (error) throw error;
      if (!orders || orders.length === 0) return { items: [], orderCount: 0 };

      const orderIds = orders.map(o => o.id);
      
      // Fetch order items in batches if needed
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('product_id, quantity, gift_quantity, unit_price, total_price')
        .in('order_id', orderIds);
      
      if (itemsError) throw itemsError;

      // Fetch product names
      const productIds = [...new Set((items || []).map(i => i.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, name, pieces_per_box')
        .in('id', productIds);

      const productMap = new Map((products || []).map(p => [p.id, p]));

      // Aggregate per product
      const agg: Record<string, { name: string; quantity: number; giftQuantity: number; totalAmount: number; piecesPerBox: number | null }> = {};
      
      for (const item of (items || [])) {
        if (!agg[item.product_id]) {
          const product = productMap.get(item.product_id);
          agg[item.product_id] = {
            name: product?.name || 'منتج غير معروف',
            quantity: 0,
            giftQuantity: 0,
            totalAmount: 0,
            piecesPerBox: product?.pieces_per_box || null,
          };
        }
        agg[item.product_id].quantity += item.quantity || 0;
        agg[item.product_id].giftQuantity += item.gift_quantity || 0;
        agg[item.product_id].totalAmount += item.total_price || 0;
      }

      return {
        items: Object.values(agg).sort((a, b) => b.quantity - a.quantity),
        orderCount: orders.length,
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
              {salesData.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card">
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
                  <div className="text-left shrink-0">
                    <p className="font-bold text-sm text-primary">{item.quantity}</p>
                    <p className="text-[10px] text-muted-foreground">{item.totalAmount.toLocaleString('ar-DZ')} د.ج</p>
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
