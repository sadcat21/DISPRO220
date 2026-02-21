import React, { useMemo } from 'react';
import { OrderWithDetails, PromoWithDetails } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, BarChart3 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface ProductStatsProps {
  orders: OrderWithDetails[];
  promos: PromoWithDetails[];
}

const ProductStats: React.FC<ProductStatsProps> = ({ orders, promos }) => {
  // Calculate product stats from promos
  const promoProductStats = useMemo(() => {
    const stats: Record<string, { 
      name: string; 
      vente: number; 
      gratuite: number; 
      promoCount: number;
    }> = {};
    
    promos.forEach(promo => {
      const productId = promo.product_id;
      const productName = promo.product?.name || 'غير معروف';
      
      if (!stats[productId]) {
        stats[productId] = {
          name: productName,
          vente: 0,
          gratuite: 0,
          promoCount: 0,
        };
      }
      
      stats[productId].vente += promo.vente_quantity;
      stats[productId].gratuite += promo.gratuite_quantity;
      stats[productId].promoCount += 1;
    });
    
    return Object.values(stats).sort((a, b) => b.vente - a.vente);
  }, [promos]);

  // Total stats
  const totalVente = promoProductStats.reduce((sum, p) => sum + p.vente, 0);
  const totalGratuite = promoProductStats.reduce((sum, p) => sum + p.gratuite, 0);
  const totalProducts = promoProductStats.length;

  // Chart data
  const chartData = useMemo(() => {
    return promoProductStats.slice(0, 8).map(stat => ({
      name: stat.name.length > 10 ? stat.name.substring(0, 10) + '...' : stat.name,
      fullName: stat.name,
      مبيعات: stat.vente,
      مجاني: stat.gratuite,
    }));
  }, [promoProductStats]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-3 text-center">
            <Package className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalProducts}</p>
            <p className="text-xs opacity-80">المنتجات</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)] text-primary-foreground">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalVente}</p>
            <p className="text-xs opacity-80">إجمالي المبيعات</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary text-secondary-foreground">
          <CardContent className="p-3 text-center">
            <BarChart3 className="w-6 h-6 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalGratuite}</p>
            <p className="text-xs opacity-80">إجمالي المجاني</p>
          </CardContent>
        </Card>
      </div>

      {/* Products Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📊 توزيع المنتجات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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

      {/* Product List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">📦 قائمة المنتجات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {promoProductStats.map((stat, index) => {
            const total = stat.vente + stat.gratuite;
            const ventePercent = total > 0 ? (stat.vente / total) * 100 : 0;
            
            return (
              <div key={index} className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">{stat.name}</span>
                  <span className="text-xs text-muted-foreground">{stat.promoCount} عملية</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-primary font-bold">{stat.vente}</span>
                    <span className="text-muted-foreground">مبيعات</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[hsl(142,76%,36%)] font-bold">{stat.gratuite}</span>
                    <span className="text-muted-foreground">مجاني</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-2 bg-[hsl(142,76%,36%)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ width: `${ventePercent}%` }}
                  />
                </div>
              </div>
            );
          })}

          {promoProductStats.length === 0 && (
            <p className="text-center py-4 text-muted-foreground">لا توجد بيانات</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductStats;
