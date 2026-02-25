import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Banknote, CreditCard, Receipt, ArrowUpRight } from 'lucide-react';

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

interface OrderDetail {
  id: string;
  total_amount: number;
  payment_type: string;
  invoice_payment_method: string | null;
  created_at: string;
  customer: { name: string; store_name: string | null } | null;
  check_number?: string;
  check_due_date?: string;
}

const PaymentMethodDetailsDialog = ({ open, onOpenChange, category }: Props) => {
  const { activeBranch } = useAuth();
  const config = categoryConfig[category];
  const Icon = config.icon;

  const { data: orders, isLoading } = useQuery({
    queryKey: ['treasury-details', category, activeBranch?.id],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, total_amount, payment_type, invoice_payment_method, created_at, customer:customers(name, store_name)')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);

      // Filter by category
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
      return (data || []) as OrderDetail[];
    },
  });

  const total = (orders || []).reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.colorClass}`} />
            {config.label}
            <Badge variant="secondary" className="mr-auto">{orders?.length || 0} عملية</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 rounded-lg bg-muted/50 text-center mb-2">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className={`text-xl font-bold ${config.colorClass}`}>{total.toLocaleString()} د.ج</p>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
        ) : !orders || orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد عمليات</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const customer = order.customer as any;
              const customerName = customer?.name || 'عميل غير معروف';
              const storeName = customer?.store_name;
              return (
                <Card key={order.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{customerName}</p>
                        {storeName && <p className="text-xs text-muted-foreground">{storeName}</p>}
                      </div>
                      <div className="text-left">
                        <p className={`font-bold ${config.colorClass}`}>
                          {Number(order.total_amount).toLocaleString()} د.ج
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ar })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentMethodDetailsDialog;
