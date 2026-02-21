import React, { useMemo } from 'react';
import { OrderWithDetails } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, TrendingUp, Package } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Badge } from '@/components/ui/badge';

interface SalesStatsProps {
  orders: OrderWithDetails[];
}

const SalesStats: React.FC<SalesStatsProps> = ({ orders }) => {
  // Only count delivered orders for sales
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  
  // Calculate sales stats
  const totalDelivered = deliveredOrders.length;
  const totalPending = orders.filter(o => o.status === 'pending' || o.status === 'assigned' || o.status === 'in_progress').length;
  const totalCancelled = orders.filter(o => o.status === 'cancelled').length;
  const successRate = orders.length > 0 ? Math.round((totalDelivered / orders.length) * 100) : 0;

  // Sales rep performance
  const salesRepStats = useMemo(() => {
    const stats: Record<string, { 
      worker: any; 
      totalOrders: number; 
      delivered: number; 
      cancelled: number;
    }> = {};
    
    orders.forEach(order => {
      const workerId = order.created_by;
      const worker = order.created_by_worker;
      
      if (!stats[workerId]) {
        stats[workerId] = {
          worker,
          totalOrders: 0,
          delivered: 0,
          cancelled: 0,
        };
      }
      
      stats[workerId].totalOrders += 1;
      if (order.status === 'delivered') stats[workerId].delivered += 1;
      if (order.status === 'cancelled') stats[workerId].cancelled += 1;
    });
    
    return Object.values(stats).sort((a, b) => b.delivered - a.delivered);
  }, [orders]);

  // Chart data
  const chartData = useMemo(() => {
    return salesRepStats.slice(0, 8).map(stat => ({
      name: stat.worker?.full_name?.split(' ')[0] || 'غير معروف',
      'تم التوصيل': stat.delivered,
      'ملغي': stat.cancelled,
      'قيد التنفيذ': stat.totalOrders - stat.delivered - stat.cancelled,
    }));
  }, [salesRepStats]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-3 text-center">
            <ShoppingCart className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-xs opacity-80">إجمالي الطلبات</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)] text-primary-foreground">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{successRate}%</p>
            <p className="text-xs opacity-80">نسبة النجاح</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(47,96%,53%)] text-primary-foreground">
          <CardContent className="p-3 text-center">
            <Package className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalDelivered}</p>
            <p className="text-xs opacity-80">تم التوصيل</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive text-destructive-foreground">
          <CardContent className="p-3 text-center">
            <DollarSign className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalCancelled}</p>
            <p className="text-xs opacity-80">ملغي</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Rep Performance Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📈 أداء مندوبي المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      direction: 'rtl'
                    }} 
                  />
                  <Legend wrapperStyle={{ direction: 'rtl' }} />
                  <Bar dataKey="تم التوصيل" stackId="a" fill="hsl(142, 76%, 36%)" />
                  <Bar dataKey="قيد التنفيذ" stackId="a" fill="hsl(47, 96%, 53%)" />
                  <Bar dataKey="ملغي" stackId="a" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Rep List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">👤 قائمة مندوبي المبيعات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {salesRepStats.map(({ worker, totalOrders, delivered, cancelled }) => {
            const rate = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;
            return (
              <div key={worker?.id || 'unknown'} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                    {worker?.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-bold">{worker?.full_name || 'غير معروف'}</p>
                    <p className="text-xs text-muted-foreground">{totalOrders} طلبية • {rate}% نجاح</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    {delivered} ✓
                  </Badge>
                  {cancelled > 0 && (
                    <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      {cancelled} ✗
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}

          {salesRepStats.length === 0 && (
            <p className="text-center py-4 text-muted-foreground">لا توجد بيانات</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesStats;
