import React, { useMemo } from 'react';
import { PromoWithDetails, Worker } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Users, TrendingUp } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface PromoStatsProps {
  promos: PromoWithDetails[];
  workers: Worker[];
  selectedWorker: string;
  setSelectedWorker: (value: string) => void;
}

const PromoStats: React.FC<PromoStatsProps> = ({
  promos,
  workers,
  selectedWorker,
  setSelectedWorker,
}) => {
  const totalVente = promos.reduce((sum, p) => sum + p.vente_quantity, 0);
  const totalGratuite = promos.reduce((sum, p) => sum + p.gratuite_quantity, 0);
  const totalPromos = promos.length;

  const workerStats = workers.map((worker) => {
    const workerPromos = promos.filter((p) => p.worker_id === worker.id);
    return {
      worker,
      totalVente: workerPromos.reduce((sum, p) => sum + p.vente_quantity, 0),
      totalGratuite: workerPromos.reduce((sum, p) => sum + p.gratuite_quantity, 0),
      totalPromos: workerPromos.length,
    };
  }).sort((a, b) => b.totalVente - a.totalVente);

  const productStats = promos.reduce((acc, promo) => {
    const productName = promo.product?.name || 'غير معروف';
    if (!acc[productName]) {
      acc[productName] = { vente: 0, gratuite: 0, count: 0 };
    }
    acc[productName].vente += promo.vente_quantity;
    acc[productName].gratuite += promo.gratuite_quantity;
    acc[productName].count += 1;
    return acc;
  }, {} as Record<string, { vente: number; gratuite: number; count: number }>);

  // Prepare chart data for workers - vertical bar chart
  const workerChartData = useMemo(() => {
    return workerStats
      .filter(ws => ws.totalVente > 0 || ws.totalGratuite > 0)
      .slice(0, 8)
      .map(ws => ({
        name: ws.worker.full_name?.split(' ')[0] || '',
        مبيعات: ws.totalVente,
        مجاني: ws.totalGratuite,
      }));
  }, [workerStats]);

  // Prepare chart data for products - vertical bar chart
  const productChartData = useMemo(() => {
    return Object.entries(productStats)
      .slice(0, 8)
      .map(([name, stats]) => ({
        name: name.length > 10 ? name.substring(0, 10) + '...' : name,
        fullName: name,
        مبيعات: stats.vente,
        مجاني: stats.gratuite,
      }));
  }, [productStats]);

  return (
    <div className="space-y-4">
      {/* Worker Filter */}
      <Select value={selectedWorker} onValueChange={setSelectedWorker}>
        <SelectTrigger className="w-full">
          <Users className="w-4 h-4 ml-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          <SelectItem value="all">جميع العمال</SelectItem>
          {workers.map((worker) => (
            <SelectItem key={worker.id} value={worker.id}>
              {worker.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-3 text-center">
            <Package className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalVente}</p>
            <p className="text-xs opacity-80">المبيعات</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)] text-primary-foreground">
          <CardContent className="p-3 text-center">
            <Package className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalGratuite}</p>
            <p className="text-xs opacity-80">المجاني</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary text-secondary-foreground">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalPromos}</p>
            <p className="text-xs opacity-80">العمليات</p>
          </CardContent>
        </Card>
      </div>

      {/* Worker Performance Chart */}
      {workerChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📊 أداء العمال</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workerChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                  <Bar dataKey="مبيعات" fill="hsl(var(--primary))" />
                  <Bar dataKey="مجاني" fill="hsl(142, 76%, 36%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product Distribution Chart */}
      {productChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📦 توزيع المنتجات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      direction: 'rtl'
                    }}
                    labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
                  />
                  <Legend wrapperStyle={{ direction: 'rtl' }} />
                  <Bar dataKey="مبيعات" fill="hsl(var(--primary))" />
                  <Bar dataKey="مجاني" fill="hsl(142, 76%, 36%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Worker Stats List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">قائمة العمال</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workerStats.map(({ worker, totalVente, totalGratuite, totalPromos }) => (
            <div key={worker.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                  {worker.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-bold">{worker.full_name}</p>
                  <p className="text-xs text-muted-foreground">{totalPromos} عملية</p>
                </div>
              </div>
              <div className="text-left flex gap-3">
                <div>
                  <p className="text-lg font-bold text-primary">{totalVente}</p>
                  <p className="text-xs text-muted-foreground">مبيعات</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[hsl(142,76%,36%)]">{totalGratuite}</p>
                  <p className="text-xs text-muted-foreground">مجاني</p>
                </div>
              </div>
            </div>
          ))}

          {workerStats.length === 0 && (
            <p className="text-center py-4 text-muted-foreground">لا توجد بيانات</p>
          )}
        </CardContent>
      </Card>

      {/* Product Stats List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">قائمة المنتجات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(productStats).map(([name, stats]) => (
            <div key={name} className="flex items-center justify-between p-2 border-b last:border-0">
              <span className="font-medium">{name}</span>
              <div className="flex gap-3">
                <span className="text-primary font-bold">{stats.vente} مبيعات</span>
                <span className="text-[hsl(142,76%,36%)] font-bold">{stats.gratuite} مجاني</span>
              </div>
            </div>
          ))}

          {Object.keys(productStats).length === 0 && (
            <p className="text-center py-4 text-muted-foreground">لا توجد بيانات</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PromoStats;
