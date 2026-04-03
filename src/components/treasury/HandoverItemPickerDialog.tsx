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

export interface PickedItem {
  order_id: string;
  amount: number;
  customer_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentMethod: 'check' | 'receipt' | 'transfer' | 'cash';
  onConfirm: (items: PickedItem[]) => void;
}

const labels: Record<string, string> = {
  check: 'Chèques',
  receipt: 'Versement',
  transfer: 'Virement',
  cash: 'Espèces',
};

const HandoverItemPickerDialog = ({ open, onOpenChange, paymentMethod, onConfirm }: Props) => {
  const { activeBranch } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch delivered orders with this payment method
  const { data: items, isLoading } = useQuery({
    queryKey: ['handover-picker', paymentMethod, activeBranch?.id],
    enabled: open,
    queryFn: async () => {
      const baseQuery = () => {
        let query = supabase
          .from('orders')
          .select('id, total_amount, partial_amount, payment_status, invoice_payment_method, document_verification, created_at, customer_id, customers!inner(name)')
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
          if (order.invoice_payment_method === 'cash') return true;
          const verification = order.document_verification;
          return verification && typeof verification === 'object' && verification.paid_by_cash === true;
        });
      } else {
        const { data, error } = await baseQuery().eq('invoice_payment_method', paymentMethod);
        if (error) throw error;
        orders = (data || []).filter((order: any) => {
          if (paymentMethod !== 'receipt' && paymentMethod !== 'transfer') return true;
          const verification = order.document_verification;
          return !(verification && typeof verification === 'object' && verification.paid_by_cash === true);
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
          return {
            order_id: o.id,
            amount,
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

  const handleConfirm = () => {
    onConfirm(selectedItems.map(i => ({ order_id: i.order_id, amount: i.amount, customer_name: i.customer_name })));
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
