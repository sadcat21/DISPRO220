import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useNavbarPreferences = () => {
  const { workerId } = useAuth();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['navbar-preferences', workerId],
    queryFn: async () => {
      if (!workerId) return null;
      const { data, error } = await supabase
        .from('navbar_preferences')
        .select('*')
        .eq('worker_id', workerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workerId,
  });

  const savePreferences = useMutation({
    mutationFn: async (tabPaths: string[]) => {
      if (!workerId) throw new Error('No worker');
      
      const { data: existing } = await supabase
        .from('navbar_preferences')
        .select('id')
        .eq('worker_id', workerId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('navbar_preferences')
          .update({ tab_paths: tabPaths, updated_at: new Date().toISOString() })
          .eq('worker_id', workerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('navbar_preferences')
          .insert({ worker_id: workerId, tab_paths: tabPaths });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navbar-preferences'] });
    },
  });

  return {
    tabPaths: preferences?.tab_paths as string[] | null,
    isLoading,
    savePreferences,
  };
};
