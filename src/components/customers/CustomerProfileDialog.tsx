import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { Customer } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    User, Phone, MapPin, Building2, ShoppingCart, Package,
    CreditCard, TrendingUp, Info
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import CustomerRecentOrders from '@/components/orders/CustomerRecentOrders';
import { useCustomerDebts } from '@/hooks/useCustomerDebts';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface CustomerProfileDialogProps {
    customer: Customer | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const CustomerProfileDialog: React.FC<CustomerProfileDialogProps> = ({
    customer,
    open,
    onOpenChange,
}) => {
    const { t, language } = useLanguage();

    const { data: orders = [] } = useQuery({
        queryKey: ['customer-orders-detailed', customer?.id],
        queryFn: async () => {
            if (!customer?.id) return [];
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('customer_id', customer.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!customer?.id && open,
    });

    const { data: promos = [] } = useQuery({
        queryKey: ['customer-promos', customer?.id],
        queryFn: async () => {
            if (!customer?.id) return [];
            const { data, error } = await supabase
                .from('promos')
                .select('*, product:products(name)')
                .eq('customer_id', customer.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as any[];
        },
        enabled: !!customer?.id && open,
    });

    const { data: debts = [] } = useCustomerDebts({
        customerId: customer?.id,
        status: 'active'
    });

    const stats = useMemo(() => {
        const totalSpent = orders
            .filter(o => o.status === 'delivered')
            .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        return {
            totalOrders: orders.length,
            deliveredOrders: orders.filter(o => o.status === 'delivered').length,
            totalSpent,
            promoCount: promos.length,
            activeDebts: debts.length,
            totalDebt: debts.reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0)
        };
    }, [orders, promos, debts]);

    if (!customer) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="flex items-center gap-3 text-2xl">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <User className="w-6 h-6" />
                        </div>
                        <div>
                            <p>{customer.name}</p>
                            <p className="text-sm font-normal text-muted-foreground">{customer.store_name || t('common.none')}</p>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6 pt-4">
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <Card className="bg-primary/5 border-primary/10">
                                <CardBaseContent icon={<ShoppingCart className="w-4 h-4 mx-auto mb-1 text-primary" />} value={stats.totalOrders} label={t('customers.profile.stats')} />
                            </Card>
                            <Card className="bg-green-500/5 border-green-500/10">
                                <CardBaseContent icon={<TrendingUp className="w-4 h-4 mx-auto mb-1 text-green-600" />} value={`${stats.totalSpent.toLocaleString()} DA`} label={t('customers.profile.total_spent')} />
                            </Card>
                            <Card className="bg-purple-500/5 border-purple-500/10">
                                <CardBaseContent icon={<Package className="w-4 h-4 mx-auto mb-1 text-purple-600" />} value={stats.promoCount} label="عروض" />
                            </Card>
                            <Card className="bg-red-500/5 border-red-500/10">
                                <CardBaseContent icon={<CreditCard className="w-4 h-4 mx-auto mb-1 text-red-600" />} value={`${stats.totalDebt.toLocaleString()} DA`} label="ديون" />
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-1 space-y-4">
                                <h3 className="font-bold flex items-center gap-2 text-sm border-b pb-2">
                                    <Info className="w-4 h-4" />
                                    {t('customers.profile.personal_info')}
                                </h3>
                                <div className="space-y-3">
                                    <InfoItem icon={<Phone className="w-4 h-4 text-muted-foreground mt-0.5" />} label="الهاتف" value={customer.phone} dir="ltr" />
                                    <InfoItem icon={<MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />} label="العنوان / الولاية" value={`${customer.address || ''} ${customer.wilaya ? `(${customer.wilaya})` : ''}`} />
                                    <InfoItem icon={<Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />} label="المحل" value={customer.store_name} />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <Tabs defaultValue="orders" className="w-full">
                                    <TabsList className="w-full grid grid-cols-3 mb-4">
                                        <TabsTrigger value="orders" className="text-xs">{t('customers.profile.order_history')}</TabsTrigger>
                                        <TabsTrigger value="promos" className="text-xs">العروض</TabsTrigger>
                                        <TabsTrigger value="debts" className="text-xs">الديون</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="orders" className="mt-0">
                                        <div className="bg-muted/20 rounded-lg p-4">
                                            <CustomerRecentOrders customerId={customer.id} orders={orders as any} maxOrders={10} />
                                            {orders.length === 0 && <p className="text-center py-6 text-sm text-muted-foreground italic">{t('customers.profile.no_orders')}</p>}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="promos" className="mt-0">
                                        <div className="bg-muted/20 rounded-lg p-4 space-y-3">
                                            {promos.map(promo => (
                                                <div key={promo.id} className="flex justify-between items-center p-2 bg-background rounded-md border text-xs">
                                                    <div>
                                                        <p className="font-bold">{promo.product?.name || 'عرض'}</p>
                                                        <p className="text-muted-foreground">{format(new Date(promo.created_at), 'dd MMM yyyy', { locale: ar })}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{promo.vente_quantity} + {promo.gratuite_quantity}</Badge>
                                                    </div>
                                                </div>
                                            ))}
                                            {promos.length === 0 && <p className="text-center py-6 text-sm text-muted-foreground italic">لا توجد عروض مسجلة</p>}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="debts" className="mt-0">
                                        <div className="bg-muted/20 rounded-lg p-4 space-y-3">
                                            {debts.map(debt => (
                                                <div key={debt.id} className="p-3 bg-background rounded-md border text-xs space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold">مبلغ الدفع: {debt.remaining_amount} DA</span>
                                                        <Badge className={debt.status === 'active' ? 'bg-red-100 text-red-700' : ''}>{debt.status === 'active' ? 'نشط' : debt.status}</Badge>
                                                    </div>
                                                    <div className="flex justify-between text-muted-foreground text-[10px]">
                                                        <span>تاريخ الإنشاء: {format(new Date(debt.created_at), 'dd/MM/yyyy')}</span>
                                                        {debt.due_date && <span>تاريخ الاستحقاق: {format(new Date(debt.due_date), 'dd/MM/yyyy')}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                            {debts.length === 0 && <p className="text-center py-6 text-sm text-muted-foreground italic">{t('customers.profile.no_debts')}</p>}
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

const CardBaseContent: React.FC<{ icon: React.ReactNode, value: string | number, label: string }> = ({ icon, value, label }) => (
    <div className="p-3 text-center">
        {icon}
        <p className="text-xl font-bold">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    </div>
);

const InfoItem: React.FC<{ icon: React.ReactNode, label: string, value: string | null | undefined, dir?: string }> = ({ icon, label, value, dir }) => (
    <div className="flex items-start gap-3 text-sm">
        {icon}
        <div>
            <p className="text-muted-foreground text-[10px] uppercase">{label}</p>
            <p dir={dir} className="font-medium">{value || '---'}</p>
        </div>
    </div>
);

export default CustomerProfileDialog;
