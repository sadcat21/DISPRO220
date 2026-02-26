import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Coins, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ProcessedOrder {
  id: string;
  total_amount: number;
  items_subtotal: number;
  stamp_amount: number;
  stamp_percentage: number;
  created_at: string;
  items: OrderItem[];
}

interface CustomerGroup {
  customer_id: string;
  customer_name: string;
  store_name: string | null;
  orders: ProcessedOrder[];
  total: number;
  totalStamp: number;
}

const OrderDetails = ({ order, cur, dateLocale, t }: { order: ProcessedOrder; cur: string; dateLocale: any; t: (k: string) => string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <div className="grid grid-cols-3 items-center text-xs bg-muted/30 rounded p-2 cursor-pointer hover:bg-muted/50 transition-colors gap-2">
          <div className="text-start">
            <p className="text-muted-foreground">
              {format(new Date(order.created_at), 'HH:mm dd/MM', { locale: dateLocale })}
            </p>
            <p className="font-medium">{order.items_subtotal.toLocaleString()} {cur}</p>
          </div>
          <div className="text-center">
            <p className="text-amber-600 font-semibold">{order.stamp_amount.toLocaleString()} {cur}</p>
            <p className="text-[10px] text-muted-foreground">{order.stamp_percentage}%</p>
          </div>
          <div className="flex items-center justify-end">
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {order.items.length > 0 && (
          <div className="mx-1 mt-1 rounded border text-[11px]">
            <div className="grid grid-cols-4 gap-1 p-1.5 bg-muted/50 font-medium text-muted-foreground">
              <span>{t('nav.products')}</span>
              <span className="text-center">{t('orders.quantity')}</span>
              <span className="text-center">{t('orders.unit_price')}</span>
              <span className="text-end">{t('orders.total')}</span>
            </div>
            {order.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-1 p-1.5 border-t">
                <span className="truncate">{item.product_name}</span>
                <span className="text-center">{item.quantity}</span>
                <span className="text-center">{item.unit_price.toLocaleString()}</span>
                <span className="text-end">{item.total_price.toLocaleString()}</span>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-1 p-1.5 border-t bg-muted/30 font-medium">
              <span className="col-span-3">{t('treasury.total')}</span>
              <span className="text-end">{order.items_subtotal.toLocaleString()} {cur}</span>
            </div>
            <div className="grid grid-cols-4 gap-1 p-1.5 border-t bg-amber-500/10 font-medium text-amber-700">
              <span className="col-span-3">{t('treasury.stamp_total')} ({order.stamp_percentage}%)</span>
              <span className="text-end">{order.stamp_amount.toLocaleString()} {cur}</span>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

const StampDetailsDialog = ({ open, onOpenChange }: Props) => {
  const { activeBranch } = useAuth();
  const { t, language, dir } = useLanguage();
  const { data: stampTiers } = useActiveStampTiers();
  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : enUS;
  const cur = t('treasury.currency');

  const { data: customerGroups, isLoading } = useQuery({
    queryKey: ['stamp-details', activeBranch?.id, stampTiers?.length],
    enabled: open && !!stampTiers?.length,
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, total_amount, created_at, customer_id, customer:customers(name, store_name), order_items(quantity, unit_price, total_price, product:products(name))')
        .eq('status', 'delivered')
        .eq('payment_type', 'with_invoice')
        .eq('invoice_payment_method', 'cash')
        .order('created_at', { ascending: false });

      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);

      const { data, error } = await query;
      if (error) throw error;

      const groupMap = new Map<string, CustomerGroup>();

      (data || []).forEach((o: any) => {
        const customerId = o.customer_id;
        const customer = o.customer as any;
        const itemsSubtotal = (o.order_items || []).reduce((s: number, i: any) => s + Number(i.total_price || 0), 0);
        const totalAmount = Number(o.total_amount || 0);

        const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : totalAmount;
        const stampAmount = calculateStampAmount(baseAmount, stampTiers!);
        const activeTiers = stampTiers!.filter(t => t.is_active);
        const matchedTier = activeTiers.find(t => baseAmount >= t.min_amount && (t.max_amount === null || baseAmount <= t.max_amount));
        const stampPercentage = matchedTier?.percentage || 0;

        if (stampAmount <= 0) return;

        const items: OrderItem[] = (o.order_items || []).map((i: any) => ({
          product_name: (i.product as any)?.name || '—',
          quantity: i.quantity || 0,
          unit_price: Number(i.unit_price || 0),
          total_price: Number(i.total_price || 0),
        }));

        const processedOrder: ProcessedOrder = {
          id: o.id,
          total_amount: totalAmount,
          items_subtotal: itemsSubtotal,
          stamp_amount: stampAmount,
          stamp_percentage: stampPercentage,
          created_at: o.created_at,
          items,
        };

        if (!groupMap.has(customerId)) {
          groupMap.set(customerId, {
            customer_id: customerId,
            customer_name: customer?.name || t('common.unknown'),
            store_name: customer?.store_name || null,
            orders: [],
            total: 0,
            totalStamp: 0,
          });
        }

        const group = groupMap.get(customerId)!;
        group.orders.push(processedOrder);
        group.total += itemsSubtotal;
        group.totalStamp += stampAmount;
      });

      return Array.from(groupMap.values()).sort((a, b) => b.totalStamp - a.totalStamp);
    },
  });

  const grandTotal = (customerGroups || []).reduce((s, g) => s + g.total, 0);
  const grandStamp = (customerGroups || []).reduce((s, g) => s + g.totalStamp, 0);
  const totalOrders = (customerGroups || []).reduce((s, g) => s + g.orders.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" />
            {t('treasury.stamp_total')}
            <Badge variant="secondary" className="ms-auto">{totalOrders} - {customerGroups?.length || 0}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center mb-2">
          <p className="text-xs text-muted-foreground">{t('treasury.stamp_total')}</p>
          <p className="text-xl font-bold text-amber-600">{grandStamp.toLocaleString()} {cur}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{t('treasury.total')}: {grandTotal.toLocaleString()} {cur}</p>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">{t('common.loading')}</p>
        ) : !customerGroups || customerGroups.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t('treasury.no_entries')}</p>
        ) : (
          <div className="space-y-3">
            {customerGroups.map((group) => (
              <Card key={group.customer_id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm">{group.customer_name}</p>
                      {group.store_name && <p className="text-xs text-muted-foreground">{group.store_name}</p>}
                    </div>
                    <div className="text-end">
                      <p className="font-bold text-amber-600">{group.totalStamp.toLocaleString()} {cur}</p>
                      <p className="text-[10px] text-muted-foreground">{t('treasury.total')}: {group.total.toLocaleString()} {cur}</p>
                      {group.orders.length > 1 && (
                        <Badge variant="outline" className="text-[10px] mt-1">{group.orders.length}</Badge>
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-2 space-y-1.5">
                    {group.orders.map((order) => (
                      <OrderDetails key={order.id} order={order} cur={cur} dateLocale={dateLocale} t={t} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StampDetailsDialog;
