import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useWorkerPrintInfo = (workerId?: string | null) => {
  return useQuery({
    queryKey: ['worker-print-info', workerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workers')
        .select('full_name, full_name_fr, print_name, work_phone, personal_phone')
        .eq('id', workerId!)
        .single();
      if (!data) return null;
      const d = data as any;
      return {
        printName: d.print_name || d.full_name_fr || d.full_name || '',
        workPhone: d.work_phone || null,
      };
    },
    enabled: !!workerId,
    staleTime: 5 * 60 * 1000,
  });
};
