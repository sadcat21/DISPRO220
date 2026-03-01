import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface RewardTask {
  id: string;
  name: string;
  name_fr: string | null;
  category: string;
  data_source: string;
  condition_logic: any;
  reward_points: number;
  penalty_points: number;
  frequency: string;
  is_cumulative: boolean;
  is_active: boolean;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RewardPenalty {
  id: string;
  name: string;
  name_fr: string | null;
  penalty_points: number;
  trigger_event: string | null;
  is_automatic: boolean;
  is_active: boolean;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PointsLogEntry {
  id: string;
  worker_id: string;
  task_id: string | null;
  penalty_id: string | null;
  points: number;
  point_type: string;
  source_entity: string | null;
  source_entity_id: string | null;
  notes: string | null;
  point_date: string;
  branch_id: string | null;
  created_at: string;
}

export interface MonthlyBonus {
  id: string;
  worker_id: string;
  month: string;
  total_points: number;
  reward_points: number;
  penalty_points: number;
  point_value: number | null;
  bonus_amount: number;
  capped_amount: number;
  status: string;
  branch_id: string | null;
}

// Reward settings keys
const REWARD_SETTINGS_KEYS = {
  MONTHLY_BUDGET: 'reward_monthly_budget',
  PENALTIES_ENABLED: 'reward_penalties_enabled',
  ABSOLUTE_CAP: 'reward_absolute_cap',
};

export const useRewardSettings = () => {
  const { activeBranch } = useAuth();

  return useQuery({
    queryKey: ['reward-settings', activeBranch?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', Object.values(REWARD_SETTINGS_KEYS));

      const settings: Record<string, string> = {};
      for (const row of data || []) {
        settings[row.key] = row.value;
      }
      return {
        monthlyBudget: Number(settings[REWARD_SETTINGS_KEYS.MONTHLY_BUDGET] || 0),
        penaltiesEnabled: settings[REWARD_SETTINGS_KEYS.PENALTIES_ENABLED] !== 'false',
        absoluteCap: Number(settings[REWARD_SETTINGS_KEYS.ABSOLUTE_CAP] || 0),
      };
    },
  });
};

export const useUpdateRewardSettings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: { key: string; value: string }[]) => {
      for (const s of settings) {
        const { data: existing } = await supabase
          .from('app_settings')
          .select('id')
          .eq('key', s.key)
          .maybeSingle();

        if (existing) {
          await supabase.from('app_settings').update({ value: s.value, updated_by: user?.id }).eq('id', existing.id);
        } else {
          await supabase.from('app_settings').insert({ key: s.key, value: s.value, updated_by: user?.id });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-settings'] });
      toast.success('تم حفظ الإعدادات');
    },
  });
};

export const useRewardTasks = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['reward-tasks', activeBranch?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reward_tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RewardTask[];
    },
  });
};

export const useCreateRewardTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (task: Partial<RewardTask>) => {
      const { error } = await supabase.from('reward_tasks').insert(task as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      toast.success('تم إنشاء المهمة');
    },
  });
};

export const useUpdateRewardTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RewardTask> & { id: string }) => {
      const { error } = await supabase.from('reward_tasks').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      toast.success('تم تحديث المهمة');
    },
  });
};

export const useRewardPenalties = () => {
  return useQuery({
    queryKey: ['reward-penalties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reward_penalties')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RewardPenalty[];
    },
  });
};

export const useCreateRewardPenalty = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (penalty: Partial<RewardPenalty>) => {
      const { error } = await supabase.from('reward_penalties').insert(penalty as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-penalties'] });
      toast.success('تم إنشاء المخالفة');
    },
  });
};

export const useWorkerPointsSummary = (workerId?: string) => {
  return useQuery({
    queryKey: ['worker-points', workerId],
    enabled: !!workerId,
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('employee_points_log')
        .select('points, point_type')
        .eq('worker_id', workerId!)
        .gte('point_date', startOfMonth);

      if (error) throw error;

      let rewards = 0, penalties = 0;
      for (const row of data || []) {
        if (row.point_type === 'reward') rewards += Number(row.points);
        else penalties += Math.abs(Number(row.points));
      }

      return { rewards, penalties, total: rewards - penalties };
    },
  });
};

export const useAllWorkersPoints = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['all-workers-points', activeBranch?.id],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

      let query = supabase
        .from('employee_points_log')
        .select('worker_id, points, point_type')
        .gte('point_date', startOfMonth);

      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);

      const { data, error } = await query;
      if (error) throw error;

      const workerMap: Record<string, { rewards: number; penalties: number; total: number }> = {};
      for (const row of data || []) {
        if (!workerMap[row.worker_id]) workerMap[row.worker_id] = { rewards: 0, penalties: 0, total: 0 };
        if (row.point_type === 'reward') {
          workerMap[row.worker_id].rewards += Number(row.points);
        } else {
          workerMap[row.worker_id].penalties += Math.abs(Number(row.points));
        }
        workerMap[row.worker_id].total = workerMap[row.worker_id].rewards - workerMap[row.worker_id].penalties;
      }

      return workerMap;
    },
  });
};

export const REWARD_SETTINGS_KEYS_EXPORT = REWARD_SETTINGS_KEYS;
