import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VerificationChecklistItem {
  id: string;
  document_type: 'check' | 'receipt' | 'transfer';
  group_title: string;
  label: string;
  field_type: 'checkbox' | 'text' | 'number' | 'date';
  sort_order: number;
  is_active: boolean;
  uses_company_info: boolean;
  company_info_template: string | null;
  branch_id: string | null;
  created_at: string;
}

export const useVerificationChecklist = (documentType?: 'check' | 'receipt' | 'transfer') => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['verification-checklist', documentType],
    queryFn: async () => {
      let q = supabase
        .from('verification_checklist_items')
        .select('*')
        .order('sort_order', { ascending: true });

      if (documentType) {
        q = q.eq('document_type', documentType);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as VerificationChecklistItem[];
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: Omit<VerificationChecklistItem, 'id' | 'created_at'>) => {
      const { error } = await supabase
        .from('verification_checklist_items')
        .insert(item as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-checklist'] });
      toast.success('تم إضافة بند التحقق');
    },
    onError: () => toast.error('فشل إضافة بند التحقق'),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VerificationChecklistItem> & { id: string }) => {
      const { error } = await supabase
        .from('verification_checklist_items')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-checklist'] });
      toast.success('تم تحديث بند التحقق');
    },
    onError: () => toast.error('فشل تحديث بند التحقق'),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('verification_checklist_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-checklist'] });
      toast.success('تم حذف بند التحقق');
    },
    onError: () => toast.error('فشل حذف بند التحقق'),
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    addItem,
    updateItem,
    deleteItem,
  };
};
