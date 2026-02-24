import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface UIOverride {
  id: string;
  worker_id: string;
  element_type: string;
  element_key: string;
  is_hidden: boolean;
  created_at: string;
  updated_by: string | null;
}

// Get all UI overrides for a specific worker (admin view)
export const useWorkerUIOverrides = (workerId: string | null) => {
  return useQuery({
    queryKey: ['worker-ui-overrides', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('worker_ui_overrides')
        .select('*')
        .eq('worker_id', workerId);
      if (error) throw error;
      return data as UIOverride[];
    },
    enabled: !!workerId,
  });
};

// Get current worker's own overrides (for navigation filtering)
export const useMyUIOverrides = () => {
  const { workerId, role } = useAuth();

  return useQuery({
    queryKey: ['my-ui-overrides', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('worker_ui_overrides')
        .select('element_type, element_key, is_hidden')
        .eq('worker_id', workerId)
        .eq('is_hidden', true);
      if (error) throw error;
      return data as { element_type: string; element_key: string; is_hidden: boolean }[];
    },
    enabled: !!workerId && role !== 'admin', // Admin sees everything
  });
};

// Check if a specific element is hidden for the current worker
export const useIsElementHidden = (elementType: string, elementKey: string): boolean => {
  const { role } = useAuth();
  const { data: overrides } = useMyUIOverrides();

  // Admin always sees everything
  if (role === 'admin') return false;

  return overrides?.some(o => o.element_type === elementType && o.element_key === elementKey && o.is_hidden) ?? false;
};

// Toggle UI override for a worker
export const useToggleUIOverride = () => {
  const queryClient = useQueryClient();
  const { workerId: updatedBy } = useAuth();

  return useMutation({
    mutationFn: async ({
      workerId,
      elementType,
      elementKey,
      isHidden,
    }: {
      workerId: string;
      elementType: string;
      elementKey: string;
      isHidden: boolean;
    }) => {
      if (isHidden) {
        // Upsert the override
        const { error } = await supabase
          .from('worker_ui_overrides')
          .upsert(
            {
              worker_id: workerId,
              element_type: elementType,
              element_key: elementKey,
              is_hidden: true,
              updated_by: updatedBy,
            },
            { onConflict: 'worker_id,element_type,element_key' }
          );
        if (error) throw error;
      } else {
        // Remove the override (show element)
        const { error } = await supabase
          .from('worker_ui_overrides')
          .delete()
          .eq('worker_id', workerId)
          .eq('element_type', elementType)
          .eq('element_key', elementKey);
        if (error) throw error;
      }
    },
    onSuccess: (_, { workerId }) => {
      queryClient.invalidateQueries({ queryKey: ['worker-ui-overrides', workerId] });
      queryClient.invalidateQueries({ queryKey: ['my-ui-overrides', workerId] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
};

// Predefined UI elements that can be hidden
export const UI_ELEMENTS = {
  pages: [
    { key: '/orders', label: 'الطلبيات' },
    { key: '/my-deliveries', label: 'توصيلاتي' },
    { key: '/my-promos', label: 'عملياتي' },
    { key: '/my-stock', label: 'مخزوني' },
    { key: '/product-offers', label: 'عروض المنتجات' },
    { key: '/customer-accounts', label: 'حسابات العملاء' },
    { key: '/warehouse', label: 'المخزن' },
    { key: '/stock-receipts', label: 'وصولات المخزن' },
    { key: '/load-stock', label: 'تحميل للعامل' },
    { key: '/expenses', label: 'مصاريفي' },
    { key: '/daily-receipts', label: 'الفواتير اليومية' },
    { key: '/expenses-management', label: 'إدارة المصاريف' },
    { key: '/customer-debts', label: 'ديون العملاء' },
    { key: '/accounting', label: 'المحاسبة' },
    { key: '/worker-debts', label: 'ديون العمال' },
    { key: '/worker-tracking', label: 'تتبع العمال' },
    { key: '/geo-operations', label: 'العمليات الجغرافية' },
    { key: '/activity-logs', label: 'سجل الأحداث' },
    { key: '/nearby-stores', label: 'المحلات القريبة' },
    { key: '/branches', label: 'الفروع' },
    { key: '/customers', label: 'العملاء' },
    { key: '/workers', label: 'العمال' },
    { key: '/products', label: 'المنتجات' },
    { key: '/permissions', label: 'الصلاحيات' },
    { key: '/settings', label: 'الإعدادات' },
    { key: '/promo-table', label: 'جدول العمليات' },
    { key: '/stats', label: 'الإحصائيات' },
    { key: '/guide', label: 'الدليل' },
    { key: '/available-offers', label: 'العروض المتاحة' },
  ],
  tabs: [
    { key: '/', label: 'الرئيسية' },
    { key: '/orders', label: 'الطلبيات' },
    { key: '/my-deliveries', label: 'توصيلاتي' },
    { key: '/my-promos', label: 'عملياتي' },
    { key: '/my-stock', label: 'مخزوني' },
    { key: '/expenses', label: 'مصاريفي' },
    { key: '/customer-debts', label: 'ديون العملاء' },
  ],
  buttons: [
    { key: 'direct_sale', label: 'البيع المباشر' },
    { key: 'create_order', label: 'إنشاء طلبية' },
    { key: 'add_customer', label: 'إضافة عميل' },
    { key: 'add_promo', label: 'إضافة عملية' },
    { key: 'load_stock', label: 'تحميل مخزون' },
  ],
  actions: [
    { key: 'collect_debt', label: 'تحصيل دين' },
    { key: 'modify_order', label: 'تعديل طلبية' },
    { key: 'delete_order', label: 'حذف طلبية' },
    { key: 'print_receipt', label: 'طباعة فاتورة' },
  ],
};
