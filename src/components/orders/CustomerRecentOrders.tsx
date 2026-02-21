import React, { useMemo, useEffect, useState } from 'react';
import { OrderWithDetails } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ShoppingCart, Clock, CheckCircle, Truck, XCircle, Package, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CustomerRecentOrdersProps {
  customerId: string;
  orders: OrderWithDetails[];
  maxOrders?: number;
}

const STATUS_CONFIG = {
  pending: { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  assigned: { label: 'تم التعيين', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Package },
  in_progress: { label: 'قيد التوصيل', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  delivered: { label: 'تم التوصيل', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const CustomerRecentOrders: React.FC<CustomerRecentOrdersProps> = ({
  customerId,
  orders,
  maxOrders = 5,
}) => {
  const [orderItemsCounts, setOrderItemsCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const customerOrders = useMemo(() => {
    return orders
      .filter(order => order.customer_id === customerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, maxOrders);
  }, [orders, customerId, maxOrders]);

  // Fetch order items counts for each order
  useEffect(() => {
    const fetchOrderItemsCounts = async () => {
      if (customerOrders.length === 0) return;
      
      setIsLoading(true);
      try {
        const orderIds = customerOrders.map(o => o.id);
        const { data, error } = await supabase
          .from('order_items')
          .select('order_id, quantity')
          .in('order_id', orderIds);

        if (error) throw error;

        // Sum quantities by order_id
        const countsMap = new Map<string, number>();
        data?.forEach(item => {
          const current = countsMap.get(item.order_id) || 0;
          countsMap.set(item.order_id, current + item.quantity);
        });
        
        setOrderItemsCounts(countsMap);
      } catch (error) {
        console.error('Error fetching order items counts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderItemsCounts();
  }, [customerOrders]);

  if (customerOrders.length === 0) {
    return (
      <div className="text-center py-3 text-muted-foreground text-sm">
        <ShoppingCart className="w-5 h-5 mx-auto mb-1 opacity-50" />
        لا توجد طلبيات سابقة لهذا العميل
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
        <ShoppingCart className="w-3 h-3" />
        آخر {customerOrders.length} طلبيات
      </p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {customerOrders.map((order) => {
          const status = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
          const StatusIcon = status.icon;
          const totalPieces = orderItemsCounts.get(order.id) || 0;
          
          return (
            <div
              key={order.id}
              className="flex items-center justify-between p-2 bg-muted/30 rounded-md text-xs gap-2"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <StatusIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground whitespace-nowrap">
                  {format(new Date(order.created_at), 'dd MMM yyyy', { locale: ar })}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-muted-foreground font-medium whitespace-nowrap">
                    {totalPieces} قطعة
                  </span>
                )}
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0.5 shrink-0 ${status.color}`}>
                  {status.label}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomerRecentOrders;
