import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface CustomerCredit {
  id: string;
  customer_id: string;
  credit_type: 'financial' | 'product';
  amount: number;
  product_id: string | null;
  product_quantity: number;
  product_reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  order_id: string | null;
  worker_id: string;
  branch_id: string | null;
  notes: string | null;
  is_used: boolean;
  used_at: string | null;
  used_in_order_id: string | null;
  created_at: string;
  updated_at: string;
  product?: { id: string; name: string } | null;
}

export const useCustomerCredits = (customerId?: string | null) => {
  return useQuery({
    queryKey: ['customer-credits', customerId],
    queryFn: async () => {
      let query = supabase
        .from('customer_credits')
        .select('*, product:products(id, name)')
        .eq('is_used', false)
        .in('status', ['approved', 'pending'])
        .order('created_at', { ascending: false });

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CustomerCredit[];
    },
    enabled: !!customerId,
  });
};

export const useCustomerCreditSummary = (customerId?: string | null) => {
  const { data: credits } = useCustomerCredits(customerId);

  const summary = {
    financialTotal: 0,
    productCreditsCount: 0,
    pendingProductCredits: 0,
    hasFinancial: false,
    hasProduct: false,
  };

  if (credits) {
    for (const c of credits) {
      if (c.credit_type === 'financial' && c.status === 'approved') {
        summary.financialTotal += Number(c.amount);
        summary.hasFinancial = true;
      } else if (c.credit_type === 'product') {
        if (c.status === 'approved') {
          summary.productCreditsCount += c.product_quantity;
          summary.hasProduct = true;
        } else if (c.status === 'pending') {
          summary.pendingProductCredits += c.product_quantity;
          summary.hasProduct = true;
        }
      }
    }
  }

  return summary;
};

export const useCreateCustomerCredit = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      customer_id: string;
      credit_type: 'financial' | 'product';
      amount?: number;
      product_id?: string;
      product_quantity?: number;
      product_reason?: string;
      status?: string;
      order_id?: string;
      worker_id: string;
      branch_id?: string | null;
      notes?: string;
    }) => {
      const { error } = await supabase.from('customer_credits').insert({
        customer_id: data.customer_id,
        credit_type: data.credit_type,
        amount: data.amount || 0,
        product_id: data.product_id || null,
        product_quantity: data.product_quantity || 0,
        product_reason: data.product_reason || null,
        status: data.credit_type === 'product' ? 'pending' : 'approved',
        order_id: data.order_id || null,
        worker_id: data.worker_id,
        branch_id: data.branch_id || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
      toast({ title: 'تم تسجيل الرصيد بنجاح' });
    },
    onError: (err: any) => {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    },
  });
};

export const useMarkCreditUsed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ creditId, orderId }: { creditId: string; orderId?: string }) => {
      const { error } = await supabase
        .from('customer_credits')
        .update({
          is_used: true,
          used_at: new Date().toISOString(),
          used_in_order_id: orderId || null,
        })
        .eq('id', creditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
    },
  });
};

export const useApproveProductCredit = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ creditId }: { creditId: string }) => {
      const { error } = await supabase
        .from('customer_credits')
        .update({
          status: 'approved',
          approved_by: workerId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', creditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
      toast({ title: 'تمت الموافقة على رصيد المنتج' });
    },
    onError: () => {
      toast({ title: 'خطأ', description: 'فشلت الموافقة', variant: 'destructive' });
    },
  });
};

export const useRejectProductCredit = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ creditId, reason }: { creditId: string; reason: string }) => {
      const { error } = await supabase
        .from('customer_credits')
        .update({
          status: 'rejected',
          rejection_reason: reason,
        })
        .eq('id', creditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
      toast({ title: 'تم رفض رصيد المنتج' });
    },
    onError: () => {
      toast({ title: 'خطأ', variant: 'destructive' });
    },
  });
};
