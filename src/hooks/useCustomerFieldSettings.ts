import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  CustomerFieldSettings,
  DEFAULT_CUSTOMER_FIELD_SETTINGS,
  normalizeCustomerFieldSettings,
} from '@/types/customerFieldSettings';

const CUSTOMER_FIELD_SETTINGS_KEY = 'customer_field_rules_v1';

export const useCustomerFieldSettings = () => {
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['customer-field-settings', activeBranch?.id ?? 'global'],
    queryFn: async () => {
      const branchId = activeBranch?.id ?? null;

      if (branchId) {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', CUSTOMER_FIELD_SETTINGS_KEY)
          .eq('branch_id', branchId)
          .maybeSingle();

        if (!error && data?.value) {
          try {
            return normalizeCustomerFieldSettings(JSON.parse(data.value));
          } catch {
            return normalizeCustomerFieldSettings(data.value);
          }
        }
      }

      const { data: globalData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', CUSTOMER_FIELD_SETTINGS_KEY)
        .is('branch_id', null)
        .maybeSingle();

      if (!globalData?.value) return { ...DEFAULT_CUSTOMER_FIELD_SETTINGS };

      try {
        return normalizeCustomerFieldSettings(JSON.parse(globalData.value));
      } catch {
        return normalizeCustomerFieldSettings(globalData.value);
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: CustomerFieldSettings) => {
      const normalized = normalizeCustomerFieldSettings(settings);
      const branchId = activeBranch?.id ?? null;
      const updatedAt = new Date().toISOString();

      const updatePayload = {
        value: JSON.stringify(normalized),
        updated_by: workerId ?? null,
        updated_at: updatedAt,
      };

      let updateQuery = supabase
        .from('app_settings')
        .update(updatePayload)
        .eq('key', CUSTOMER_FIELD_SETTINGS_KEY)
        .select('id');

      if (branchId) {
        updateQuery = updateQuery.eq('branch_id', branchId);
      } else {
        updateQuery = updateQuery.is('branch_id', null);
      }

      const { data: updatedRows, error: updateError } = await updateQuery;
      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertError } = await supabase.from('app_settings').insert({
          key: CUSTOMER_FIELD_SETTINGS_KEY,
          branch_id: branchId,
          ...updatePayload,
        });

        if (insertError) throw insertError;
      }

      return normalized;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-field-settings'] });
      toast.success('تم حفظ إعدادات حقول العميل');
    },
    onError: (error: unknown) => {
      console.error('Error saving customer field settings:', error);
      toast.error('تعذر حفظ إعدادات حقول العميل');
    },
  });

  return {
    settings: query.data ?? DEFAULT_CUSTOMER_FIELD_SETTINGS,
    isLoading: query.isLoading,
    saveSettings: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
};
