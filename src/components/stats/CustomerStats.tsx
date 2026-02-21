import React, { useMemo, useState } from 'react';
import { OrderWithDetails, PromoWithDetails, Customer } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, ShoppingCart, Package, TrendingUp, MapPin } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Badge } from '@/components/ui/badge';

interface CustomerStatsProps {
  orders: OrderWithDetails[];
  promos: PromoWithDetails[];
  customers: Customer[];
}

const CustomerStats: React.FC<CustomerStatsProps> = ({ orders, promos, customers }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');

  // Calculate customer stats
  const customerStats = useMemo(() => {
    const stats: Record<string, {
      customer: Customer;
      orderCount: number;
      deliveredCount: number;
      cancelledCount: number;
      promoCount: number;
      totalVente: number;
      totalGratuite: number;
    }> = {};

    // Initialize with all customers
    customers.forEach(customer => {
      stats[customer.id] = {
        customer,
        orderCount: 0,
        deliveredCount: 0,
        cancelledCount: 0,
        promoCount: 0,
        totalVente: 0,
        totalGratuite: 0,
      };
    });

    // Count orders
    orders.forEach(order => {
      const customerId = order.customer_id;
      if (stats[customerId]) {
        stats[customerId].orderCount += 1;
        if (order.status === 'delivered') stats[customerId].deliveredCount += 1;
        if (order.status === 'cancelled') stats[customerId].cancelledCount += 1;
      }
    });

    // Count promos
    promos.forEach(promo => {
      const customerId = promo.customer_id;
      if (stats[customerId]) {
        stats[customerId].promoCount += 1;
        stats[customerId].totalVente += promo.vente_quantity;
        stats[customerId].totalGratuite += promo.gratuite_quantity;
      }
    });

    return Object.values(stats)
      .filter(s => s.orderCount > 0 || s.promoCount > 0)
      .sort((a, b) => (b.orderCount + b.promoCount) - (a.orderCount + a.promoCount));
  }, [orders, promos, customers]);

  // Summary stats
  const totalCustomers = customerStats.length;
  const totalOrders = customerStats.reduce((sum, c) => sum + c.orderCount, 0);
  const totalPromos = customerStats.reduce((sum, c) => sum + c.promoCount, 0);
  const avgOrdersPerCustomer = totalCustomers > 0 ? (totalOrders / totalCustomers).toFixed(1) : 0;

  // Chart data - top customers
  const chartData = useMemo(() => {
    return customerStats.slice(0, 8).map(stat => ({
      name: stat.customer.name.length > 12 ? stat.customer.name.substring(0, 12) + '...' : stat.customer.name,
      fullName: stat.customer.name,
      طلبات: stat.orderCount,
      عروض: stat.promoCount,
    }));
  }, [customerStats]);

  // Selected customer details
  const selectedCustomerStats = useMemo(() => {
    if (selectedCustomerId === 'all') return null;
    return customerStats.find(s => s.customer.id === selectedCustomerId);
  }, [selectedCustomerId, customerStats]);

  return (
    <div className="space-y-4">
      {/* Customer selector */}
      <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
        <SelectTrigger className="w-full">
          <Users className="w-4 h-4 ml-2" />
          <SelectValue placeholder="اختر عميل" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50 max-h-60">
          <SelectItem value="all">جميع العملاء</SelectItem>
          {customerStats.map((stat) => (
            <SelectItem key={stat.customer.id} value={stat.customer.id}>
              {stat.customer.name} ({stat.orderCount + stat.promoCount} عملية)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Summary Cards - When showing all customers */}
      {selectedCustomerId === 'all' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="p-3 text-center">
                <Users className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{totalCustomers}</p>
                <p className="text-xs opacity-80">عملاء نشطين</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(142,76%,36%)] text-primary-foreground">
              <CardContent className="p-3 text-center">
                <TrendingUp className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{avgOrdersPerCustomer}</p>
                <p className="text-xs opacity-80">متوسط الطلبات/عميل</p>
              </CardContent>
            </Card>
            <Card className="bg-secondary text-secondary-foreground">
              <CardContent className="p-3 text-center">
                <ShoppingCart className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{totalOrders}</p>
                <p className="text-xs opacity-80">إجمالي الطلبات</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(47,96%,53%)] text-primary-foreground">
              <CardContent className="p-3 text-center">
                <Package className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{totalPromos}</p>
                <p className="text-xs opacity-80">إجمالي العروض</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Customers Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">📊 أكثر العملاء نشاطاً</CardTitle>
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
                      <Bar dataKey="طلبات" fill="hsl(var(--primary))" />
                      <Bar dataKey="عروض" fill="hsl(142, 76%, 36%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Customer List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">👥 قائمة العملاء</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customerStats.slice(0, 10).map((stat) => (
                <div 
                  key={stat.customer.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => setSelectedCustomerId(stat.customer.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                      {stat.customer.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-bold">{stat.customer.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {stat.customer.wilaya || 'غير محدد'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary">
                      {stat.orderCount} طلب
                    </Badge>
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {stat.promoCount} عرض
                    </Badge>
                  </div>
                </div>
              ))}

              {customerStats.length === 0 && (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Selected Customer Details */}
      {selectedCustomerStats && (
        <>
          <Card className="border-2 border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                  {selectedCustomerStats.customer.name?.charAt(0) || '?'}
                </div>
                {selectedCustomerStats.customer.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <MapPin className="w-4 h-4" />
                <span>{selectedCustomerStats.customer.wilaya || 'غير محدد'}</span>
                {selectedCustomerStats.customer.phone && (
                  <>
                    <span>•</span>
                    <span>{selectedCustomerStats.customer.phone}</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="p-3 text-center">
                <ShoppingCart className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{selectedCustomerStats.orderCount}</p>
                <p className="text-xs opacity-80">الطلبات</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(142,76%,36%)] text-primary-foreground">
              <CardContent className="p-3 text-center">
                <Package className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{selectedCustomerStats.promoCount}</p>
                <p className="text-xs opacity-80">العروض</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(47,96%,53%)] text-primary-foreground">
              <CardContent className="p-3 text-center">
                <TrendingUp className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{selectedCustomerStats.totalVente}</p>
                <p className="text-xs opacity-80">كمية المبيعات</p>
              </CardContent>
            </Card>
            <Card className="bg-secondary text-secondary-foreground">
              <CardContent className="p-3 text-center">
                <Package className="w-6 h-6 mx-auto mb-1" />
                <p className="text-2xl font-bold">{selectedCustomerStats.totalGratuite}</p>
                <p className="text-xs opacity-80">الكمية المجانية</p>
              </CardContent>
            </Card>
          </div>

          {/* Order status breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">📋 حالة الطلبات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{selectedCustomerStats.deliveredCount}</p>
                  <p className="text-xs text-muted-foreground">تم التوصيل</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {selectedCustomerStats.orderCount - selectedCustomerStats.deliveredCount - selectedCustomerStats.cancelledCount}
                  </p>
                  <p className="text-xs text-muted-foreground">قيد التنفيذ</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{selectedCustomerStats.cancelledCount}</p>
                  <p className="text-xs text-muted-foreground">ملغي</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default CustomerStats;
