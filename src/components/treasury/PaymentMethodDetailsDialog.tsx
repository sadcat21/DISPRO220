import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Banknote, CreditCard, Receipt, ArrowUpRight, Coins } from 'lucide-react';

type PaymentCategory = 'cash_invoice1' | 'cash_invoice2' | 'check' | 'bank_receipt' | 'bank_transfer';

const categoryConfig: Record<PaymentCategory, { label: string; icon: any; colorClass: string }> = {
  cash_invoice1: { label: 'كاش فاتورة 1', icon: Banknote, colorClass: 'text-green-500' },
  cash_invoice2: { label: 'كاش فاتورة 2', icon: Banknote, colorClass: 'text-emerald-500' },
  check: { label: 'شيكات', icon: CreditCard, colorClass: 'text-blue-500' },
  bank_receipt: { label: 'فيرسمو', icon: Receipt, colorClass: 'text-purple-500' },
  bank_transfer: { label: 'فيرمو', icon: ArrowUpRight, colorClass: 'text-orange-500' },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: PaymentCategory;
}

interface ProcessedOrder {
  id: string;
  total_amount: number;
  items_subtotal: number;
  stamp_amount: number;
  stamp_percentage: number;
  created_at: string;
}

interface CustomerGroup {
  customer_id: string;
  customer_name: string;
  store_name: string | null;
  orders: ProcessedOrder[];
  total: number;
  totalStamp: number;
}

const PaymentMethodDetailsDialog = ({ open, onOpenChange, category }: Props) => {
  const { activeBranch } = useAuth();
  const config = categoryConfig[category];
  const Icon = config.icon;
  const isCashInvoice1 = category === 'cash_invoice1';
  const { data: stampTiers } = useActiveStampTiers();

  const { data: customerGroups, isLoading } = useQuery({
    queryKey: ['treasury-details', category, activeBranch?.id, stampTiers?.length],
    enabled: open && (isCashInvoice1 ? !!stampTiers : true),
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, total_amount, payment_type, invoice_payment_method, created_at, customer_id, customer:customers(name, store_name), order_items(total_price)')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);

      switch (category) {
        case 'cash_invoice1':
          query = query.eq('payment_type', 'with_invoice').eq('invoice_payment_method', 'cash');
          break;
        case 'cash_invoice2':
          query = query.eq('payment_type', 'without_invoice');
          break;
        case 'check':
          query = query.eq('payment_type', 'with_invoice').eq('invoice_payment_method', 'check');
          break;
        case 'bank_receipt':
          query = query.eq('payment_type', 'with_invoice').eq('invoice_payment_method', 'receipt');
          break;
        case 'bank_transfer':
          query = query.eq('payment_type', 'with_invoice').eq('invoice_payment_method', 'transfer');
          break;
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by customer
      const groupMap = new Map<string, CustomerGroup>();

      (data || []).forEach((o: any) => {
        const customerId = o.customer_id;
        const customer = o.customer as any;
        const totalAmount = Number(o.total_amount || 0);
        const itemsSubtotal = (o.order_items || []).reduce((s: number, i: any) => s + Number(i.total_price || 0), 0);

        // Calculate stamp using tiers for cash_invoice1
        let stampAmount = 0;
        let stampPercentage = 0;
        if (isCashInvoice1 && stampTiers?.length) {
          // Use items subtotal if available, otherwise reverse-calculate from total
          const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : totalAmount;
          stampAmount = calculateStampAmount(baseAmount, stampTiers);
          // Find matching tier percentage
          const activeTiers = stampTiers.filter(t => t.is_active);
          const matchedTier = activeTiers.find(t => baseAmount >= t.min_amount && (t.max_amount === null || baseAmount <= t.max_amount));
          if (matchedTier) stampPercentage = matchedTier.percentage;
        }

        const processedOrder: ProcessedOrder = {
          id: o.id,
          total_amount: totalAmount,
          items_subtotal: itemsSubtotal,
          stamp_amount: stampAmount,
          stamp_percentage: stampPercentage,
          created_at: o.created_at,
        };

        if (!groupMap.has(customerId)) {
          groupMap.set(customerId, {
            customer_id: customerId,
            customer_name: customer?.name || 'عميل غير معروف',
            store_name: customer?.store_name || null,
            orders: [],
            total: 0,
            totalStamp: 0,
          });
        }

        const group = groupMap.get(customerId)!;
        group.orders.push(processedOrder);
        group.total += totalAmount;
        group.totalStamp += stampAmount;
      });

      return Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
    },
  });

  const grandTotal = (customerGroups || []).reduce((s, g) => s + g.total, 0);
  const grandStamp = isCashInvoice1 ? (customerGroups || []).reduce((s, g) => s + g.totalStamp, 0) : 0;
  const totalOrders = (customerGroups || []).reduce((s, g) => s + g.orders.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.colorClass}`} />
            {config.label}
            <Badge variant="secondary" className="mr-auto">{totalOrders} عملية - {customerGroups?.length || 0} عميل</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 rounded-lg bg-muted/50 text-center mb-2">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className={`text-xl font-bold ${config.colorClass}`}>{grandTotal.toLocaleString()} د.ج</p>
        </div>

        {isCashInvoice1 && grandStamp > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center mb-2">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Coins className="w-4 h-4 text-amber-600" />
              <p className="text-xs font-medium text-amber-700">إجمالي الطوابع (ضريبة)</p>
            </div>
            <p className="text-lg font-bold text-amber-600">{grandStamp.toLocaleString()} د.ج</p>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
        ) : !customerGroups || customerGroups.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد عمليات</p>
        ) : (
          <div className="space-y-3">
            {customerGroups.map((group) => (
              <Card key={group.customer_id}>
                <CardContent className="p-3">
                  {/* Customer header */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm">{group.customer_name}</p>
                      {group.store_name && <p className="text-xs text-muted-foreground">{group.store_name}</p>}
                    </div>
                    <div className="text-left">
                      <p className={`font-bold ${config.colorClass}`}>{group.total.toLocaleString()} د.ج</p>
                      {group.orders.length > 1 && (
                        <Badge variant="outline" className="text-[10px] mt-1">{group.orders.length} عمليات</Badge>
                      )}
                    </div>
                  </div>

                  {/* Individual orders */}
                  {group.orders.length > 1 && (
                    <div className="border-t pt-2 space-y-1.5">
                      {group.orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between text-xs bg-muted/30 rounded p-2">
                          <p className="text-muted-foreground">
                            {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ar })}
                          </p>
                          <div className="text-left">
                            <p className="font-medium">{order.total_amount.toLocaleString()} د.ج</p>
                            {isCashInvoice1 && order.stamp_amount > 0 && (
                              <p className="text-[10px] text-amber-600">
                                طابع ({order.stamp_percentage}%): {order.stamp_amount.toLocaleString()} د.ج
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Single order date */}
                  {group.orders.length === 1 && (
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-muted-foreground">
                        {format(new Date(group.orders[0].created_at), 'dd/MM/yyyy HH:mm', { locale: ar })}
                      </p>
                      {isCashInvoice1 && group.orders[0].stamp_amount > 0 && (
                        <p className="text-amber-600 flex items-center gap-1">
                          <Coins className="w-3 h-3" />
                          طابع ({group.orders[0].stamp_percentage}%): {group.orders[0].stamp_amount.toLocaleString()} د.ج
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentMethodDetailsDialog;
