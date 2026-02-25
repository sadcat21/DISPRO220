import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';


const CUSTOMER_TYPES_KEY = 'customer_types';

export interface CustomerTypeEntry {
  ar: string;
  fr: string;
  en: string;
  short?: string;
}

const DEFAULT_TYPES: CustomerTypeEntry[] = [
  { ar: 'محل', fr: 'Magasin', en: 'Store', short: 'mag' },
  { ar: 'سوبر ماركت', fr: 'Supermarché', en: 'Supermarket', short: 'sup' },
  { ar: 'مول', fr: 'Mall', en: 'Mall', short: 'mall' },
  { ar: 'كروسيست', fr: 'Grossiste', en: 'Wholesaler', short: 'gros' },
];

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
      if (!data) return DEFAULT_TYPES;
      try {
        const parsed = JSON.parse(data.value);
        // Handle legacy format (simple string array)
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          return (parsed as string[]).map(name => ({ ar: name, fr: name, en: name, short: '' }));
        }
        return parsed as CustomerTypeEntry[];
      } catch {
        return DEFAULT_TYPES;
      }
    },
  });

  const updateTypes = useMutation({
    mutationFn: async (types: CustomerTypeEntry[]) => {
      const value = JSON.stringify(types);
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

/**
 * Get the display name for a customer type based on language.
 * Handles both old format (plain string) and new format (object with translations).
 */
export const getCustomerTypeLabel = (
  types: CustomerTypeEntry[],
  arValue: string | null | undefined,
  language: string
): string => {
  if (!arValue) return '';
  const entry = types.find(t => t.ar === arValue);
  if (!entry) return arValue;
  return (entry as any)[language] || entry.ar;
};
