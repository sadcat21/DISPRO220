import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CoinExchangeTask {
  id: string;
  branch_id: string | null;
  manager_id: string;
  worker_id: string;
  coin_amount: number;
  returned_amount: number;
  remaining_amount: number;
  status: 'active' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  worker?: { id: string; full_name: string };
}

export interface CoinExchangeReturn {
  id: string;
  task_id: string;
  amount: number;
  received_by: string;
  notes: string | null;
  created_at: string;
  receiver?: { id: string; full_name: string };
}

export const useCoinExchangeTasks = (workerId?: string) => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['coin-exchange-tasks', workerId, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('coin_exchange_tasks')
        .select('*, worker:workers!coin_exchange_tasks_worker_id_fkey(id, full_name)')
        .order('created_at', { ascending: false });
      if (workerId) query = query.eq('worker_id', workerId);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as CoinExchangeTask[];
    },
  });
};

export const useCoinExchangeReturns = (taskId: string | null) => {
  return useQuery({
    queryKey: ['coin-exchange-returns', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('coin_exchange_returns')
        .select('*, receiver:workers!coin_exchange_returns_received_by_fkey(id, full_name)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as CoinExchangeReturn[];
    },
    enabled: !!taskId,
  });
};

export const useCreateCoinExchange = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (params: { worker_id: string; coin_amount: number; notes?: string }) => {
      const { data, error } = await supabase
        .from('coin_exchange_tasks')
        .insert({
          manager_id: workerId!,
          branch_id: activeBranch?.id || null,
          worker_id: params.worker_id,
          coin_amount: params.coin_amount,
          notes: params.notes || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coin-exchange-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    },
  });
};

export const useReceiveBills = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      task_id: string;
      amount: number;
      notes?: string;
      current_returned: number;
      total_amount: number;
    }) => {
      // Insert return record
      const { error: retErr } = await supabase
        .from('coin_exchange_returns')
        .insert({
          task_id: params.task_id,
          amount: params.amount,
          received_by: workerId!,
          notes: params.notes || null,
        } as any);
      if (retErr) throw retErr;

      // Update task
      const newReturned = params.current_returned + params.amount;
      const newStatus = newReturned >= params.total_amount ? 'completed' : 'active';
      const { error: updErr } = await supabase
        .from('coin_exchange_tasks')
        .update({
          returned_amount: newReturned,
          status: newStatus,
          ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', params.task_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coin-exchange-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['coin-exchange-returns'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    },
  });
};
