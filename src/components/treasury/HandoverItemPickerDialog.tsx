import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { isTransferPaidByCash, resolveReceiptBucket } from '@/utils/treasuryDocumentClassification';

export interface PickedItem {
  order_id: string;
  amount: number;
  customer_name: string;
  stamp_amount?: number;
  total_with_stamp?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentMethod: 'check' | 'receipt' | 'receipt_cash' | 'transfer' | 'cash';
  onConfirm: (items: PickedItem[]) => void;
}

const labels: Record<string, string> = {
  check: 'Chèques',
  receipt: 'Versement Doc',
  receipt_cash: 'Versement Cash',
  transfer: 'Virement',
  cash: 'Espèces',
};

const HandoverItemPickerDialog = ({ open, onOpenChange, paymentMethod, onConfirm }: Props) => {
  const { activeBranch } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: stampTiers } = useActiveStampTiers();

  // Fetch delivered orders with this payment method
  const { data: items, isLoading } = useQuery({
    queryKey: ['handover-picker', paymentMethod, activeBranch?.id],
    enabled: open,
    queryFn: async () => {
      const baseQuery = () => {
        let query = supabase
          .from('orders')
          .select('id, total_amount, partial_amount, payment_status, invoice_payment_method, document_verification, created_at, customer_id, customers!inner(name), order_items(total_price)')
          .eq('status', 'delivered')
          .eq('payment_type', 'with_invoice');
        if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
        return query;
      };

      let orders: any[] = [];
      if (paymentMethod === 'cash') {
        const { data, error } = await baseQuery().in('invoice_payment_method', ['cash', 'receipt', 'transfer']);
        if (error) throw error;
        orders = (data || []).filter((order: any) => {
          return order.invoice_payment_method === 'cash';
        });
      } else {
        const invoiceMethod = paymentMethod === 'receipt_cash' ? 'receipt' : paymentMethod;
        const { data, error } = await baseQuery().eq('invoice_payment_method', invoiceMethod);
        if (error) throw error;
        orders = (data || []).filter((order: any) => {
          if (paymentMethod === 'receipt_cash') {
            return resolveReceiptBucket(order.document_verification) === 'cash';
          }
          if (paymentMethod === 'receipt') {
            return resolveReceiptBucket(order.document_verification) === 'doc';
          }
          if (paymentMethod === 'transfer') {
            return !isTransferPaidByCash(order.document_verification);
          }
          return true;
        });
      }

      // Get already handed-over order IDs
      const { data: handedOver } = await supabase
        .from('handover_items')
        .select('order_id')
        .eq('payment_method', paymentMethod);
      
      const handedOverIds = new Set((handedOver || []).map((h: any) => h.order_id));

      return (orders || [])
        .filter((o: any) => !handedOverIds.has(o.id))
        .map((o: any) => {
          let amount = Number(o.total_amount || 0);
          if (o.payment_status === 'partial') amount = Number(o.partial_amount || 0);
          else if (o.payment_status === 'debt') amount = 0;
          const itemsSubtotal = (o.order_items || []).reduce((sum: number, item: any) => sum + Number(item.total_price || 0), 0);
          const stampAmount =
            paymentMethod === 'cash' && stampTiers?.length
              ? calculateStampAmount(itemsSubtotal > 0 ? itemsSubtotal : amount, stampTiers)
              : 0;
          return {
            order_id: o.id,
            amount,
            stamp_amount: stampAmount,
            total_with_stamp: amount + stampAmount,
            customer_name: (o.customers as any)?.name || '',
            created_at: o.created_at,
          };
        })
        .filter((o: any) => o.amount > 0);
    },
  });

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!items) return;
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.order_id)));
    }
  };

  const selectedItems = (items || []).filter(i => selected.has(i.order_id));
  const totalAmount = selectedItems.reduce((s, i) => s + i.amount, 0);
  const totalStampAmount = selectedItems.reduce((s, i) => s + Number(i.stamp_amount || 0), 0);
  const totalWithStamp = totalAmount + totalStampAmount;

  const handleConfirm = () => {
    onConfirm(selectedItems.map(i => ({
      order_id: i.order_id,
      amount: i.amount,
      customer_name: i.customer_name,
      stamp_amount: i.stamp_amount,
      total_with_stamp: i.total_with_stamp,
    })));
    setSelected(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>اختيار {labels[paymentMethod]} للتسليم</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">لا توجد عناصر غير مسلّمة</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
                {selected.size === items.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </Button>
              <Badge variant="secondary" className="text-xs">
                {selected.size} / {items.length}
              </Badge>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {items.map(item => (
                <div
                  key={item.order_id}
                  onClick={() => toggle(item.order_id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selected.has(item.order_id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <Checkbox checked={selected.has(item.order_id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.customer_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                    {paymentMethod === 'cash' && Number(item.stamp_amount || 0) > 0 && (
                      <p className="mt-0.5 text-[10px] text-amber-600">
                        طابع: {Number(item.stamp_amount || 0).toLocaleString()} د.ج
                        {' · '}
                        الإجمالي: {Number(item.total_with_stamp || item.amount).toLocaleString()} د.ج
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-primary whitespace-nowrap">
                    {item.amount.toLocaleString()} د.ج
                  </p>
                </div>
              ))}
            </div>

            {selected.size > 0 && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">المجموع ({selected.size} عنصر)</span>
                  <span className="font-bold text-primary">{totalAmount.toLocaleString()} د.ج</span>
                </div>
                {paymentMethod === 'cash' && totalStampAmount > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">الطابع</span>
                      <span className="font-bold text-amber-600">{totalStampAmount.toLocaleString()} د.ج</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">الإجمالي مع الطابع</span>
                      <span className="font-bold text-green-600">{totalWithStamp.toLocaleString()} د.ج</span>
                    </div>
                  </>
                )}
                <Button onClick={handleConfirm} className="w-full gap-2">
                  <Check className="w-4 h-4" />
                  تأكيد الاختيار
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HandoverItemPickerDialog;
