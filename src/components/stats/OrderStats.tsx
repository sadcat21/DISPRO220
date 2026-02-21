import React, { useMemo } from 'react';
import { OrderWithDetails, Worker } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Clock, CheckCircle, XCircle } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';

interface OrderStatsProps {
  orders: OrderWithDetails[];
  workers: Worker[];
}

const OrderStats: React.FC<OrderStatsProps> = ({
  orders,
  workers,
}) => {
  const { t } = useLanguage();

  // Calculate order stats
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'assigned' || o.status === 'in_progress').length;
  const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

  // Status labels
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('orders.pending');
      case 'assigned': return t('orders.assigned');
      case 'in_progress': return t('orders.in_progress');
      case 'delivered': return t('orders.delivered');
      case 'cancelled': return t('orders.cancelled');
      default: return status;
    }
  };

  // Status distribution for bar chart
  const statusStats = useMemo(() => {
    const stats: Record<string, number> = {};
    orders.forEach(order => {
      stats[order.status] = (stats[order.status] || 0) + 1;
    });
    return Object.entries(stats).map(([status, count]) => ({
      name: getStatusLabel(status),
      value: count,
      status,
    }));
  }, [orders, t]);

  // Sales rep stats (created_by)
  const salesRepStats = useMemo(() => {
    const stats: Record<string, { worker: any; orders: number; delivered: number; cancelled: number }> = {};
    
    orders.forEach(order => {
      const workerId = order.created_by;
      const worker = order.created_by_worker;
      
      if (!stats[workerId]) {
        stats[workerId] = {
          worker,
          orders: 0,
          delivered: 0,
          cancelled: 0,
        };
      }
      
      stats[workerId].orders += 1;
      if (order.status === 'delivered') stats[workerId].delivered += 1;
      if (order.status === 'cancelled') stats[workerId].cancelled += 1;
    });
    
    return Object.values(stats).sort((a, b) => b.orders - a.orders);
  }, [orders]);

  // Delivery worker stats (assigned_worker_id)
  const deliveryWorkerStats = useMemo(() => {
    const stats: Record<string, { worker: any; assigned: number; delivered: number; inProgress: number }> = {};
    
    orders.filter(o => o.assigned_worker_id).forEach(order => {
      const workerId = order.assigned_worker_id!;
      const worker = order.assigned_worker;
      
      if (!stats[workerId]) {
        stats[workerId] = {
          worker,
          assigned: 0,
          delivered: 0,
          inProgress: 0,
        };
      }
      
      stats[workerId].assigned += 1;
      if (order.status === 'delivered') stats[workerId].delivered += 1;
      if (order.status === 'in_progress') stats[workerId].inProgress += 1;
    });
    
    return Object.values(stats).sort((a, b) => b.assigned - a.assigned);
  }, [orders]);

  // Chart data for sales reps - vertical bar chart
  const salesRepChartData = useMemo(() => {
    return salesRepStats.slice(0, 6).map(stat => ({
      name: stat.worker?.full_name?.split(' ')[0] || t('common.unknown'),
      [t('orders.delivered')]: stat.delivered,
      [t('stats.in_progress')]: stat.orders - stat.delivered - stat.cancelled,
      [t('orders.cancelled')]: stat.cancelled,
    }));
  }, [salesRepStats, t]);

  // Chart data for delivery workers - vertical bar chart
  const deliveryChartData = useMemo(() => {
    return deliveryWorkerStats.slice(0, 6).map(stat => ({
      name: stat.worker?.full_name?.split(' ')[0] || t('common.unknown'),
      [t('orders.delivered')]: stat.delivered,
      [t('orders.in_progress')]: stat.inProgress,
      [t('orders.assigned')]: stat.assigned - stat.delivered - stat.inProgress,
    }));
  }, [deliveryWorkerStats, t]);

  // Status chart data for bar chart
  const statusChartData = useMemo(() => {
    return statusStats.map(stat => ({
      name: stat.name,
      [t('stats.count')]: stat.value,
    }));
  }, [statusStats, t]);

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-3 text-center">
            <ShoppingCart className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalOrders}</p>
            <p className="text-xs opacity-80">{t('stats.total_orders')}</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)] text-primary-foreground">
          <CardContent className="p-3 text-center">
            <CheckCircle className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{deliveredOrders}</p>
            <p className="text-xs opacity-80">{t('orders.delivered')}</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(47,96%,53%)] text-primary-foreground">
          <CardContent className="p-3 text-center">
            <Clock className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{pendingOrders}</p>
            <p className="text-xs opacity-80">{t('stats.in_progress')}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive text-destructive-foreground">
          <CardContent className="p-3 text-center">
            <XCircle className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{cancelledOrders}</p>
            <p className="text-xs opacity-80">{t('orders.cancelled')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution Bar Chart */}
      {statusChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📊 {t('stats.status_distribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey={t('stats.count')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Rep Performance Chart */}
      {salesRepChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📈 {t('stats.sales_rep_performance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesRepChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                    }} 
                  />
                  <Legend />
                  <Bar dataKey={t('orders.delivered')} stackId="a" fill="hsl(142, 76%, 36%)" />
                  <Bar dataKey={t('stats.in_progress')} stackId="a" fill="hsl(47, 96%, 53%)" />
                  <Bar dataKey={t('orders.cancelled')} stackId="a" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery Worker Performance Chart */}
      {deliveryChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">🚚 {t('stats.delivery_performance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deliveryChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                    }} 
                  />
                  <Legend />
                  <Bar dataKey={t('orders.delivered')} stackId="a" fill="hsl(142, 76%, 36%)" />
                  <Bar dataKey={t('orders.in_progress')} stackId="a" fill="hsl(280, 87%, 65%)" />
                  <Bar dataKey={t('orders.assigned')} stackId="a" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Rep Stats List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">👤 {t('stats.sales_reps')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {salesRepStats.map(({ worker, orders, delivered, cancelled }) => (
            <div key={worker?.id || 'unknown'} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                  {worker?.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-bold">{worker?.full_name || t('common.unknown')}</p>
                  <p className="text-xs text-muted-foreground">{orders} {t('stats.orders_count')}</p>
                </div>
              </div>
              <div className="text-left flex gap-2">
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
          ))}

          {salesRepStats.length === 0 && (
            <p className="text-center py-4 text-muted-foreground">{t('common.no_data')}</p>
          )}
        </CardContent>
      </Card>

      {/* Delivery Worker Stats List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">🚚 {t('stats.delivery_workers')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deliveryWorkerStats.map(({ worker, assigned, delivered, inProgress }) => (
            <div key={worker?.id || 'unknown'} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
                  {worker?.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-bold">{worker?.full_name || t('common.unknown')}</p>
                  <p className="text-xs text-muted-foreground">{assigned} {t('stats.tasks_count')}</p>
                </div>
              </div>
              <div className="text-left flex gap-2">
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {delivered} ✓
                </Badge>
                {inProgress > 0 && (
                  <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                    {inProgress} 🚚
                  </Badge>
                )}
              </div>
            </div>
          ))}

          {deliveryWorkerStats.length === 0 && (
            <p className="text-center py-4 text-muted-foreground">{t('common.no_data')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderStats;
