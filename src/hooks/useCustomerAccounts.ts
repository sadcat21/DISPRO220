import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CustomerAccount, CustomerAccountStatus } from '@/types/customerAccount';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export const useCustomerAccounts = (status?: CustomerAccountStatus) => {
  return useQuery({
    queryKey: ['customer-accounts', status],
    queryFn: async () => {
      let query = supabase
        .from('customer_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as CustomerAccount[];
    },
  });
};

export const useApproveCustomerAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async ({ accountId }: { accountId: string }) => {
      // First get the account details
      const { data: account, error: accountError } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('id', accountId)
        .single();
      
      if (accountError || !account) throw new Error('فشل في جلب بيانات الحساب');

      // Find the branch that matches the account's wilaya
      let branchId: string | null = null;
      if (account.wilaya) {
        const { data: branch } = await supabase
          .from('branches')
          .select('id')
          .eq('wilaya', account.wilaya)
          .eq('is_active', true)
          .maybeSingle();
        
        branchId = branch?.id || null;
      }

      // Create a new customer linked to this account
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: account.store_name,
          phone: account.phone,
          address: account.address,
          wilaya: account.wilaya,
          branch_id: branchId,
          created_by: workerId,
        })
        .select()
        .single();
      
      if (customerError) throw customerError;

      // Update the customer account with approval info and link to customer
      const { error } = await supabase
        .from('customer_accounts')
        .update({
          status: 'approved',
          approved_by: workerId,
          approved_at: new Date().toISOString(),
          customer_id: newCustomer.id,
        })
        .eq('id', accountId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'تم التفعيل',
        description: 'تم تفعيل حساب التاجر وإضافته كعميل في الفرع المناسب',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'خطأ',
        description: error.message || 'فشل تفعيل الحساب',
        variant: 'destructive',
      });
    },
  });
};

export const useRejectCustomerAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ accountId, reason }: { accountId: string; reason: string }) => {
      const { error } = await supabase
        .from('customer_accounts')
        .update({
          status: 'rejected',
          rejection_reason: reason,
        })
        .eq('id', accountId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-accounts'] });
      toast({
        title: 'تم الرفض',
        description: 'تم رفض طلب التاجر',
      });
    },
    onError: () => {
      toast({
        title: 'خطأ',
        description: 'فشل رفض الطلب',
        variant: 'destructive',
      });
    },
  });
};

export const useSuspendCustomerAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from('customer_accounts')
        .update({ status: 'suspended' })
        .eq('id', accountId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-accounts'] });
      toast({
        title: 'تم الإيقاف',
        description: 'تم إيقاف حساب التاجر',
      });
    },
    onError: () => {
      toast({
        title: 'خطأ',
        description: 'فشل إيقاف الحساب',
        variant: 'destructive',
      });
    },
  });
};

export const useReactivateCustomerAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from('customer_accounts')
        .update({
          status: 'approved',
          approved_by: workerId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', accountId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-accounts'] });
      toast({
        title: 'تم إعادة التفعيل',
        description: 'تم إعادة تفعيل حساب التاجر',
      });
    },
    onError: () => {
      toast({
        title: 'خطأ',
        description: 'فشل إعادة التفعيل',
        variant: 'destructive',
      });
    },
  });
};
