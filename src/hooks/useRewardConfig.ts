import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface RewardConfig {
  id: string;
  branch_id: string | null;
  point_value: number;
  monthly_budget: number;
  auto_percentage: number;
  competition_percentage: number;
  reserve_percentage: number;
  minimum_threshold: number;
  top1_bonus_pct: number;
  top2_bonus_pct: number;
  top3_bonus_pct: number;
  is_active: boolean;
}

export interface ReserveEntry {
  id: string;
  month: string;
  carried_balance: number;
  surplus_added: number;
  used_amount: number;
  notes: string | null;
}

export const useRewardConfig = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['reward-config', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('reward_config').select('*').eq('is_active', true);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query.limit(1).maybeSingle();
      return data as RewardConfig | null;
    },
  });
};

export const useUpsertRewardConfig = () => {
  const queryClient = useQueryClient();
  const { user, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (config: Partial<RewardConfig>) => {
      const { data: existing } = await supabase.from('reward_config')
        .select('id').eq('is_active', true)
        .eq('branch_id', activeBranch?.id || '')
        .maybeSingle();

      const payload = { ...config, updated_by: user?.id, branch_id: activeBranch?.id || null };

      if (existing) {
        const { error } = await supabase.from('reward_config').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reward_config').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-config'] });
      toast.success('تم حفظ إعدادات المحرك');
    },
  });
};

export const useReserveFund = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['reward-reserve-fund', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('reward_reserve_fund').select('*').order('month', { ascending: false }).limit(12);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return (data || []) as ReserveEntry[];
    },
  });
};

export const useUpdateReserveFund = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, used_amount, notes }: { id: string; used_amount: number; notes?: string }) => {
      const { error } = await supabase.from('reward_reserve_fund').update({ used_amount, notes }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-reserve-fund'] });
      toast.success('تم تحديث الصندوق');
    },
  });
};
