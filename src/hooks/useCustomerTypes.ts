import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const CUSTOMER_TYPES_KEY = 'customer_types';

// Distinct colors for customer types (by shortcode)
export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  sup: '#1d4ed8',   // أزرق داكن
  épi: '#15803d',   // أخضر داكن
  alim: '#b45309',  // ذهبي داكن
  spm: '#6d28d9',   // بنفسجي داكن
  gros: '#be123c',  // أحمر قرمزي
  mall: '#a21caf',  // فوشيا داكن
};

const CUSTOMER_TYPE_COLOR_FALLBACKS = ['#0e7490', '#0f766e', '#c2410c', '#4338ca', '#4d7c0f', '#9f1239'];

export const getCustomerTypeColor = (shortCode?: string | null, index = 0): string => {
  if (shortCode && CUSTOMER_TYPE_COLORS[shortCode]) return CUSTOMER_TYPE_COLORS[shortCode];
  return CUSTOMER_TYPE_COLOR_FALLBACKS[index % CUSTOMER_TYPE_COLOR_FALLBACKS.length];
};

export interface CustomerTypeEntry {
  ar: string;
  fr: string;
  en: string;
  short?: string;
  description?: string;
}

const DEFAULT_TYPES: CustomerTypeEntry[] = [
  { ar: 'سوبيرات', fr: 'Supérette', en: 'Mini-market', short: 'sup', description: 'محل متوسط في الحي يبيع تشكيلة متنوعة من المواد الغذائية والمنظفات والأواني' },
  { ar: 'بقالة', fr: 'Épicerie', en: 'Grocery', short: 'épi', description: 'محل صغير في الحي يبيع المواد الغذائية الأساسية فقط' },
  { ar: 'تغذية عامة', fr: 'Alimentation Générale', en: 'General Food Store', short: 'alim', description: 'محل متخصص في المواد الغذائية بشكل شامل: لحوم، خبز، مواد غذائية متنوعة' },
  { ar: 'سوبر ماركت', fr: 'Supermarché', en: 'Supermarket', short: 'spm', description: 'مساحة تجارية كبيرة منظمة بأقسام ورفوف متعددة' },
  { ar: 'كروسيست', fr: 'Grossiste', en: 'Wholesaler', short: 'gros', description: 'تاجر جملة يبيع بكميات كبيرة للمحلات والتجار' },
  { ar: 'مول', fr: 'Mall / Grande Surface', en: 'Mall', short: 'mall', description: 'مركز تجاري كبير يضم عدة محلات وأقسام متنوعة' },
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
          return (parsed as string[]).map(name => ({ ar: name, fr: name, en: name, short: '', description: '' }));
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
