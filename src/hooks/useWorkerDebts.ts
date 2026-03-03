import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';

export interface WorkerDebt {
  id: string;
  worker_id: string;
  branch_id: string | null;
  amount: number;
  debt_type: 'advance' | 'deficit' | 'surplus';
  session_id: string | null;
  description: string | null;
  status: 'active' | 'paid' | 'partially_paid';
  paid_amount: number;
  remaining_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  worker?: { id: string; full_name: string; username: string };
  created_by_worker?: { id: string; full_name: string };
}

export interface WorkerDebtPayment {
  id: string;
  worker_debt_id: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  collected_by: string;
  created_at: string;
  collector?: { id: string; full_name: string };
}

export const useWorkerDebts = (workerId?: string) => {
  const { activeBranch } = useAuth();

  useRealtimeSubscription(
    `worker-debts-realtime-${workerId || 'all'}`,
    [
      { table: 'worker_debts', filter: workerId ? `worker_id=eq.${workerId}` : undefined },
      { table: 'worker_debt_payments' },
    ],
    [
      ['worker-debts', workerId || undefined, activeBranch?.id],
      ['worker-debt-payments'],
    ],
    true
  );

  return useQuery({
    queryKey: ['worker-debts', workerId, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('worker_debts')
        .select(`
          *,
          worker:workers!worker_debts_worker_id_fkey(id, full_name, username),
          created_by_worker:workers!worker_debts_created_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (workerId) query = query.eq('worker_id', workerId);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as WorkerDebt[];
    },
  });
};

export const useWorkerDebtPayments = (debtId: string | null) => {
  useRealtimeSubscription(
    `worker-debt-payments-realtime-${debtId || 'all'}`,
    [{ table: 'worker_debt_payments', filter: debtId ? `worker_debt_id=eq.${debtId}` : undefined }],
    [['worker-debt-payments', debtId || undefined]],
    !!debtId
  );

  return useQuery({
    queryKey: ['worker-debt-payments', debtId],
    queryFn: async () => {
      if (!debtId) return [];
      const { data, error } = await supabase
        .from('worker_debt_payments')
        .select(`*, collector:workers!worker_debt_payments_collected_by_fkey(id, full_name)`)
        .eq('worker_debt_id', debtId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as WorkerDebtPayment[];
    },
    enabled: !!debtId,
  });
};

export const useCreateWorkerDebt = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      worker_id: string;
      amount: number;
      debt_type: 'advance' | 'deficit' | 'surplus';
      session_id?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from('worker_debts')
        .insert({
          worker_id: params.worker_id,
          amount: params.amount,
          debt_type: params.debt_type,
          session_id: params.session_id || null,
          description: params.description || null,
          branch_id: activeBranch?.id || null,
          created_by: workerId!,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
    },
  });
};

export const usePayWorkerDebt = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      worker_debt_id: string;
      amount: number;
      payment_method: string;
      notes?: string;
      current_paid: number;
      total_amount: number;
    }) => {
      // Insert payment
      const { error: payErr } = await supabase
        .from('worker_debt_payments')
        .insert({
          worker_debt_id: params.worker_debt_id,
          amount: params.amount,
          payment_method: params.payment_method,
          notes: params.notes || null,
          collected_by: workerId!,
        });
      if (payErr) throw payErr;

      // Update debt
      const newPaid = params.current_paid + params.amount;
      const newStatus = newPaid >= params.total_amount ? 'paid' : 'partially_paid';
      const { error: updErr } = await supabase
        .from('worker_debts')
        .update({ paid_amount: newPaid, status: newStatus })
        .eq('id', params.worker_debt_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debt-payments'] });
    },
  });
};
