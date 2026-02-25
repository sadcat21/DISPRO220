import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const CUSTOMER_TYPES_KEY = 'customer_types';

export const useCustomerTypes = () => {
  const queryClient = useQueryClient();

  const { data: customerTypes = [], isLoading } = useQuery({
    queryKey: ['customer-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', CUSTOMER_TYPES_KEY)
        .maybeSingle();
      if (error) throw error;
      if (!data) return ['محل', 'سوبر ماركت', 'مول', 'كروسيست'];
      try {
        return JSON.parse(data.value) as string[];
      } catch {
        return ['محل', 'سوبر ماركت', 'مول', 'كروسيست'];
      }
    },
  });

  const updateTypes = useMutation({
    mutationFn: async (types: string[]) => {
      const value = JSON.stringify(types);
      // Try update first
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', CUSTOMER_TYPES_KEY)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('app_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', CUSTOMER_TYPES_KEY);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings')
          .insert({ key: CUSTOMER_TYPES_KEY, value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
    },
  });

  return { customerTypes, isLoading, updateTypes };
};
