import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { AlertCircle, ArrowUpRight, Banknote, Coins, CreditCard, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { resolveReceiptBucket } from '@/utils/treasuryDocumentClassification';

type PaymentCategory =
  | 'cash_invoice1'
  | 'cash_invoice2'
  | 'check'
  | 'bank_receipt_cash'
  | 'bank_receipt'
  | 'bank_transfer';

const categoryConfig: Record<PaymentCategory, { label: string; icon: any; colorClass: string }> = {
  cash_invoice1: { label: 'Espèces Facture 1', icon: Banknote, colorClass: 'text-green-500' },
  cash_invoice2: { label: 'Espèces Facture 2', icon: Banknote, colorClass: 'text-emerald-500' },
  check: { label: 'Chèques', icon: CreditCard, colorClass: 'text-blue-500' },
  bank_receipt_cash: { label: 'Versement Cash', icon: Receipt, colorClass: 'text-fuchsia-500' },
  bank_receipt: { label: 'Versement Doc', icon: Receipt, colorClass: 'text-purple-500' },
  bank_transfer: { label: 'Virement', icon: ArrowUpRight, colorClass: 'text-orange-500' },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: PaymentCategory;
  handedCashInvoice2Amount?: number;
}

interface ProcessedOrder {
  id: string;
  total_amount: number;
  items_subtotal: number;
  stamp_amount: number;
  stamp_percentage: number;
  created_at: string;
  is_debt: boolean;
  debt_amount: number;
}

interface CustomerGroup {
  customer_id: string;
  customer_name: string;
  store_name: string | null;
  orders: ProcessedOrder[];
  total: number;
  totalStamp: number;
  totalDebt: number;
}

const PaymentMethodDetailsDialog = ({ open, onOpenChange, category, handedCashInvoice2Amount: handedCashInvoice2AmountProp = 0 }: Props) => {
  const { activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const config = categoryConfig[category];
  const Icon = config.icon;
  const isCashInvoice1 = category === 'cash_invoice1';
  const isCashInvoice2 = category === 'cash_invoice2';
  const isReceiptCash = category === 'bank_receipt_cash';
  const { data: stampTiers } = useActiveStampTiers();
  const { data: handedCashInvoice2AmountFromQuery = 0 } = useQuery({
    queryKey: ['treasury-handed-cash-invoice2', activeBranch?.id],
    enabled: open && isCashInvoice2,
    queryFn: async () => {
      let query = supabase.from('manager_handovers').select('cash_invoice2');
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).reduce((sum: number, handover: any) => sum + Number(handover.cash_invoice2 || 0), 0);
    },
  });
  const handedCashInvoice2Amount = handedCashInvoice2AmountProp || handedCashInvoice2AmountFromQuery;

  const { data: customerGroups, isLoading } = useQuery({
    queryKey: ['treasury-details', category, activeBranch?.id, stampTiers?.length, handedCashInvoice2Amount],
    enabled: open && (isCashInvoice1 ? !!stampTiers : true),
    queryFn: async () => {
      let handedQuery = supabase
        .from('handover_items')
        .select('order_id, payment_method, handover:manager_handovers!inner(branch_id)');
      if (activeBranch?.id) handedQuery = handedQuery.eq('handover.branch_id', activeBranch.id);
      const { data: handedItems, error: handedError } = await handedQuery;
      if (handedError) throw handedError;

      const handedByOrder = new Map<string, Set<string>>();
      for (const item of handedItems || []) {
        if (!item.order_id) continue;
        if (!handedByOrder.has(item.order_id)) {
          handedByOrder.set(item.order_id, new Set());
        }
        handedByOrder.get(item.order_id)!.add(String(item.payment_method || ''));
      }

      let query = supabase
        .from('orders')
        .select(
          'id, total_amount, payment_status, partial_amount, payment_type, invoice_payment_method, created_at, customer_id, document_verification, customer:customers(name, store_name), order_items(total_price)',
        )
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
        case 'bank_receipt_cash':
        case 'bank_receipt':
          query = query.eq('payment_type', 'with_invoice').eq('invoice_payment_method', 'receipt');
          break;
        case 'bank_transfer':
          query = query.eq('payment_type', 'with_invoice').eq('invoice_payment_method', 'transfer');
          break;
      }

      const { data, error } = await query;
      if (error) throw error;

      const processedOrders: any[] = [];

      (data || []).forEach((o: any) => {
        const receiptBucket = resolveReceiptBucket(o.document_verification);
        const handedMethods = handedByOrder.get(o.id) || new Set<string>();

        const isHandedForCategory =
          (category === 'cash_invoice1' && handedMethods.has('cash')) ||
          (category === 'check' && handedMethods.has('check')) ||
          (category === 'bank_receipt' && handedMethods.has('receipt')) ||
          (category === 'bank_transfer' && handedMethods.has('transfer')) ||
          (category === 'bank_receipt_cash' &&
            (handedMethods.has('receipt_cash') || handedMethods.has('cash') || handedMethods.has('receipt')));

        if (isHandedForCategory) return;
        if (category === 'bank_receipt_cash' && receiptBucket !== 'cash') return;
        if (category === 'bank_receipt' && receiptBucket !== 'doc') return;

        const customerId = o.customer_id;
        const customer = o.customer as any;
        const totalAmount = Number(o.total_amount || 0);
        const itemsSubtotal = (o.order_items || []).reduce((s: number, i: any) => s + Number(i.total_price || 0), 0);

        let debtAmount = 0;
        const isDebt = o.payment_status === 'debt';
        if (o.payment_status === 'partial') {
          debtAmount = totalAmount - Number(o.partial_amount || 0);
        } else if (isDebt) {
          debtAmount = totalAmount;
        }

        let displayAmount = totalAmount;
        if (isCashInvoice2) {
          if (o.payment_status === 'partial') {
            displayAmount = Number(o.partial_amount || 0);
          } else if (isDebt) {
            displayAmount = 0;
          }
        } else if (!isCashInvoice1 && !isCashInvoice2) {
          if (o.payment_status === 'partial') {
            displayAmount = Number(o.partial_amount || 0);
          } else if (isDebt) {
            displayAmount = 0;
          }
        }

        if (!isCashInvoice1 && displayAmount <= 0) return;

        let stampAmount = 0;
        let stampPercentage = 0;
        if (isCashInvoice1 && stampTiers?.length && totalAmount > 0) {
          const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : totalAmount;
          stampAmount = calculateStampAmount(baseAmount, stampTiers);
          const activeTiers = stampTiers.filter((tier) => tier.is_active);
          const matchedTier = activeTiers.find(
            (tier) => baseAmount >= tier.min_amount && (tier.max_amount === null || baseAmount <= tier.max_amount),
          );
          if (matchedTier) stampPercentage = matchedTier.percentage;
        }

        const processedOrder: ProcessedOrder = {
          id: o.id,
          total_amount: displayAmount,
          items_subtotal: itemsSubtotal,
          stamp_amount: stampAmount,
          stamp_percentage: stampPercentage,
          created_at: o.created_at,
          is_debt: isCashInvoice2 ? false : isDebt || o.payment_status === 'partial',
          debt_amount: isCashInvoice2 ? 0 : debtAmount,
        };

        processedOrders.push({
          customer_id: customerId,
          customer_name: customer?.name || 'عميل غير معروف',
          store_name: customer?.store_name || null,
          order: processedOrder,
        });
      });

      let normalizedOrders = processedOrders;
      if (isCashInvoice2) {
        let remainingHanded = handedCashInvoice2Amount;
        normalizedOrders = processedOrders
          .sort((a, b) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime())
          .flatMap((entry) => {
            if (remainingHanded <= 0) return [entry];
            const orderAmount = Number(entry.order.total_amount || 0);
            if (remainingHanded >= orderAmount) {
              remainingHanded -= orderAmount;
              return [];
            }
            const adjustedOrder = {
              ...entry.order,
              total_amount: Math.max(0, orderAmount - remainingHanded),
            };
            remainingHanded = 0;
            return adjustedOrder.total_amount > 0 ? [{ ...entry, order: adjustedOrder }] : [];
          });
      }

      const groupMap = new Map<string, CustomerGroup>();

      normalizedOrders.forEach((entry) => {
        const customerId = entry.customer_id;
        const customerName = entry.customer_name;
        const storeName = entry.store_name;
        const processedOrder = entry.order as ProcessedOrder;

        if (!groupMap.has(customerId)) {
          groupMap.set(customerId, {
            customer_id: customerId,
            customer_name: customerName,
            store_name: storeName,
            orders: [],
            total: 0,
            totalStamp: 0,
            totalDebt: 0,
          });
        }

        const group = groupMap.get(customerId)!;
        group.orders.push(processedOrder);
        group.total += Number(processedOrder.total_amount || 0);
        group.totalStamp += Number(processedOrder.stamp_amount || 0);
        group.totalDebt += Number(processedOrder.debt_amount || 0);
      });

      return Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
    },
  });

  const moveGroupToReceiptDoc = async (group: CustomerGroup) => {
    try {
      const orderIds = group.orders.map((order) => order.id);
      if (orderIds.length === 0) return;

      const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, document_verification')
        .in('id', orderIds);
      if (fetchError) throw fetchError;

      for (const order of orders || []) {
        const verification =
          order.document_verification && typeof order.document_verification === 'object' && !Array.isArray(order.document_verification)
            ? { ...(order.document_verification as Record<string, any>) }
            : {};

        verification.manager_receipt_bucket = 'doc';
        verification.paid_by_cash = false;

        const { error } = await supabase
          .from('orders')
          .update({
            document_status: 'received',
            document_verification: verification,
          })
          .eq('id', order.id);

        if (error) throw error;
      }

      toast.success('تم تحويل العميل إلى Versement Doc');
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-details'] });
      queryClient.invalidateQueries({ queryKey: ['handover-picker'] });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحويل العميل إلى Versement Doc');
    }
  };

  const grandTotal = (customerGroups || []).reduce((sum, group) => sum + group.total, 0);
  const grandStamp = isCashInvoice1 ? (customerGroups || []).reduce((sum, group) => sum + group.totalStamp, 0) : 0;
  const grandDebt = (customerGroups || []).reduce((sum, group) => sum + group.totalDebt, 0);
  const totalOrders = (customerGroups || []).reduce((sum, group) => sum + group.orders.length, 0);
  const invoice1GrandTotal = isCashInvoice1 ? grandTotal + grandStamp : grandTotal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.colorClass}`} />
            {config.label}
            <Badge variant="secondary" className="mr-auto">
              {totalOrders} عملية - {customerGroups?.length || 0} عميل
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="mb-2 rounded-lg bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className={`text-xl font-bold ${config.colorClass}`}>{invoice1GrandTotal.toLocaleString()} د.ج</p>
        </div>

        {isCashInvoice1 && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">قيمة المشتريات</p>
                <p className="text-sm font-bold text-green-600">{grandTotal.toLocaleString()} د.ج</p>
              </div>
              {grandStamp > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-center">
                  <div className="mb-0.5 flex items-center justify-center gap-1">
                    <Coins className="h-3 w-3 text-amber-600" />
                    <p className="text-[10px] font-medium text-amber-700">قيمة الطابع</p>
                  </div>
                  <p className="text-sm font-bold text-amber-600">{grandStamp.toLocaleString()} د.ج</p>
                </div>
              )}
            </div>
            {grandDebt > 0 && (
              <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-xs font-medium text-destructive">ديون غير محصلة (مستعارة من Facture 2)</p>
                </div>
                <p className="text-lg font-bold text-destructive">{grandDebt.toLocaleString()} د.ج</p>
              </div>
            )}
          </>
        )}

        {!isCashInvoice1 && !isCashInvoice2 && grandDebt > 0 && (
          <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
            <p className="text-xs font-medium text-destructive">ديون غير محصلة</p>
            <p className="text-lg font-bold text-destructive">{grandDebt.toLocaleString()} د.ج</p>
          </div>
        )}

        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">جاري التحميل...</p>
        ) : !customerGroups || customerGroups.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">لا توجد عمليات</p>
        ) : (
          <div className="space-y-3">
            {customerGroups.map((group) => (
              <Card key={group.customer_id}>
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{group.customer_name}</p>
                      {group.store_name && <p className="text-xs text-muted-foreground">{group.store_name}</p>}
                    </div>
                    <div className="text-left">
                      <p className={`font-bold ${config.colorClass}`}>{group.total.toLocaleString()} د.ج</p>
                      {group.orders.length > 1 && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {group.orders.length} عمليات
                        </Badge>
                      )}
                    </div>
                  </div>

                  {isReceiptCash && (
                    <div className="mb-2 flex justify-end">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => moveGroupToReceiptDoc(group)}>
                        تحويل إلى Versement Doc
                      </Button>
                    </div>
                  )}

                  {group.orders.length > 1 && (
                    <div className="space-y-1.5 border-t pt-2">
                      {group.orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between rounded bg-muted/30 p-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">
                              {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ar })}
                            </p>
                            {order.debt_amount > 0 && <p className="text-[10px] text-destructive">دين: {order.debt_amount.toLocaleString()} د.ج</p>}
                          </div>
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

                  {group.orders.length === 1 && (
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <p className="text-muted-foreground">
                          {format(new Date(group.orders[0].created_at), 'dd/MM/yyyy HH:mm', { locale: ar })}
                        </p>
                        {group.orders[0].debt_amount > 0 && (
                          <p className="text-[10px] text-destructive">دين: {group.orders[0].debt_amount.toLocaleString()} د.ج</p>
                        )}
                      </div>
                      <div className="text-left">
                        {isCashInvoice1 && group.orders[0].stamp_amount > 0 && (
                          <p className="flex items-center gap-1 text-amber-600">
                            <Coins className="h-3 w-3" />
                            طابع ({group.orders[0].stamp_percentage}%): {group.orders[0].stamp_amount.toLocaleString()} د.ج
                          </p>
                        )}
                      </div>
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
