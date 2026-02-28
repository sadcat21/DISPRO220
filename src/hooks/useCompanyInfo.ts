import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CompanyInfo {
  company_name: string;
  company_activity: string;
  company_address: string;
  company_phone: string;
  company_mobile: string;
  company_rc: string;
  company_nif: string;
  company_ai: string;
  company_nis: string;
  company_bank: string;
  company_rib: string;
}

const COMPANY_INFO_KEY = 'company_info';

const defaultCompanyInfo: CompanyInfo = {
  company_name: '',
  company_activity: '',
  company_address: '',
  company_phone: '',
  company_mobile: '',
  company_rc: '',
  company_nif: '',
  company_ai: '',
  company_nis: '',
  company_bank: '',
  company_rib: '',
};

export const useCompanyInfo = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['company-info'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', COMPANY_INFO_KEY)
        .maybeSingle();

      if (error) throw error;
      if (!data) return defaultCompanyInfo;

      try {
        return { ...defaultCompanyInfo, ...JSON.parse(data.value) } as CompanyInfo;
      } catch {
        return defaultCompanyInfo;
      }
    },
  });

  const mutation = useMutation({
    mutationFn: async (info: CompanyInfo) => {
      const value = JSON.stringify(info);
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', COMPANY_INFO_KEY)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('app_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', COMPANY_INFO_KEY);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings')
          .insert({ key: COMPANY_INFO_KEY, value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-info'] });
      toast.success('تم حفظ معلومات الشركة');
    },
    onError: () => {
      toast.error('فشل حفظ معلومات الشركة');
    },
  });

  return {
    companyInfo: query.data || defaultCompanyInfo,
    isLoading: query.isLoading,
    saveCompanyInfo: mutation.mutate,
    isSaving: mutation.isPending,
  };
};
