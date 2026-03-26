import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const WorkerSalesSummaryCard: React.FC = () => {
  const { workerId } = useAuth();
  const { t } = useLanguage();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayStr = todayStart.toISOString();
  const todayEndStr = todayEnd.toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['worker-daily-sales-summary', workerId],
    queryFn: async () => {
      // Get today's delivered orders for this worker via stock_movements
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('order_id')
        .eq('worker_id', workerId!)
        .eq('movement_type', 'delivery')
        .eq('status', 'approved')
        .gte('created_at', todayStr)
        .lte('created_at', todayEndStr);

      const orderIds = Array.from(new Set((movements || []).map(m => m.order_id).filter(Boolean)));
      if (orderIds.length === 0) return { totalSales: 0, paidAmount: 0, newDebts: 0, orderCount: 0 };

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, payment_status, partial_amount')
        .in('id', orderIds)
        .eq('status', 'delivered');

      if (!orders || orders.length === 0) return { totalSales: 0, paidAmount: 0, newDebts: 0, orderCount: 0 };

      let totalSales = 0;
      let paidAmount = 0;
      let newDebts = 0;

      for (const o of orders) {
        const total = Number(o.total_amount || 0);
        totalSales += total;

        if (o.payment_status === 'cash' || o.payment_status === 'paid') {
          paidAmount += total;
        } else if (o.payment_status === 'partial') {
          const partial = Number(o.partial_amount || 0);
          paidAmount += partial;
          newDebts += total - partial;
        } else if (o.payment_status === 'credit' || o.payment_status === 'pending') {
          newDebts += total;
        } else if (o.payment_status === 'check') {
          paidAmount += total;
        }
      }

      return { totalSales, paidAmount, newDebts, orderCount: orders.length };
    },
    enabled: !!workerId,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  if (isLoading) {
    return (
      <div className="px-4 mt-3">
        <Card className="border border-border">
          <CardContent className="p-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || data.orderCount === 0) return null;

  return (
    <div className="px-4 mt-3">
      <Card className="border border-primary/20 bg-gradient-to-br from-background to-muted/30 overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">ملخص المبيعات</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {data.orderCount}
            </Badge>
          </div>

          {/* Total Sales */}
          <div className="px-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">إجمالي المبيعات</span>
              <span className="text-xl font-bold text-destructive">
                {data.totalSales.toLocaleString()} DA
              </span>
            </div>
          </div>

          {/* Paid & Debts */}
          <div className="grid grid-cols-2 gap-0 border-t border-border">
            <div className="p-3 text-center border-e border-border">
              <p className="text-xs text-muted-foreground mb-0.5">المبالغ المدفوعة</p>
              <p className="font-bold text-sm">{data.paidAmount.toLocaleString()} DA</p>
            </div>
            <div className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">ديون جديدة</p>
              <p className="font-bold text-sm">{data.newDebts.toLocaleString()} DA</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerSalesSummaryCard;
