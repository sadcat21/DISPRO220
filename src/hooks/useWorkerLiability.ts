import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WorkerLiabilitySummary {
  workerId: string;
  workerName: string;
  deliveredCash: number;
  debtCollectionsCash: number;
  approvedExpenses: number;
  accountedAmount: number;
  manualAdjustment: number;
  totalLiability: number;
}

async function calcWorkerLiability(workerId: string, branchId?: string | null): Promise<WorkerLiabilitySummary | null> {
  // 1. Worker info
  const { data: worker } = await supabase.from('workers').select('id, full_name').eq('id', workerId).single();
  if (!worker) return null;

  // 2. Find the last completed accounting session to know what's already settled
  let sessQuery = supabase
    .from('accounting_sessions')
    .select('id, period_end')
    .eq('worker_id', workerId)
    .eq('status', 'completed')
    .order('period_end', { ascending: false })
    .limit(1);
  if (branchId) sessQuery = sessQuery.eq('branch_id', branchId);
  const { data: lastSession } = await sessQuery;
  
  const lastSettledDate = lastSession && lastSession.length > 0 ? lastSession[0].period_end : null;

  // 3. Delivered orders: only those AFTER the last settled session
  let ordersQuery = supabase
    .from('orders')
    .select('total_amount, partial_amount, payment_status, payment_type')
    .eq('assigned_worker_id', workerId)
    .eq('status', 'delivered');
  if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId);
  if (lastSettledDate) ordersQuery = ordersQuery.gt('created_at', lastSettledDate);
  const { data: orders = [] } = await ordersQuery;

  let deliveredCash = 0;
  for (const o of orders) {
    if (o.payment_status === 'cash' || o.payment_status === 'check') {
      deliveredCash += Number(o.total_amount || 0);
    } else if (o.payment_status === 'partial') {
      deliveredCash += Number(o.partial_amount || 0);
    }
  }

  // 4. Approved debt collections AFTER last session
  let collQuery = supabase
    .from('debt_collections')
    .select('amount_collected')
    .eq('worker_id', workerId)
    .eq('status', 'approved');
  if (lastSettledDate) collQuery = collQuery.gt('created_at', lastSettledDate);
  const { data: collections = [] } = await collQuery;
  const debtCollectionsCash = collections.reduce((s, c) => s + Number(c.amount_collected || 0), 0);

  // 5. Approved expenses AFTER last session
  let expQuery = supabase.from('expenses').select('amount').eq('worker_id', workerId).eq('status', 'approved').eq('payment_method', 'cash');
  if (branchId) expQuery = expQuery.eq('branch_id', branchId);
  if (lastSettledDate) expQuery = expQuery.gt('created_at', lastSettledDate);
  const { data: expenses = [] } = await expQuery;
  const approvedExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  // 6. accountedAmount = 0 (we already exclude settled data by date filter)
  const accountedAmount = 0;

  // 7. Manual adjustments (these are always counted as they represent explicit overrides)
  let adjQuery = supabase.from('worker_liability_adjustments').select('amount, adjustment_type').eq('worker_id', workerId);
  if (branchId) adjQuery = adjQuery.eq('branch_id', branchId);
  const { data: adjustments = [] } = await adjQuery;
  const manualAdjustment = adjustments.reduce((s, a) => {
    return s + (a.adjustment_type === 'add' ? Number(a.amount || 0) : -Number(a.amount || 0));
  }, 0);

  const totalLiability = deliveredCash + debtCollectionsCash - approvedExpenses - accountedAmount + manualAdjustment;

  return {
    workerId: worker.id,
    workerName: worker.full_name,
    deliveredCash,
    debtCollectionsCash,
    approvedExpenses,
    accountedAmount,
    manualAdjustment,
    totalLiability,
  };
}

export const useWorkerLiability = (workerId?: string | null) => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['worker-liability', workerId, activeBranch?.id],
    queryFn: () => calcWorkerLiability(workerId!, activeBranch?.id),
    enabled: !!workerId,
  });
};

export const useAllWorkersLiability = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['all-workers-liability', activeBranch?.id],
    queryFn: async (): Promise<WorkerLiabilitySummary[]> => {
      let wQuery = supabase.from('workers').select('id, full_name').eq('is_active', true).eq('role', 'worker');
      if (activeBranch?.id) wQuery = wQuery.eq('branch_id', activeBranch.id);
      const { data: workers = [] } = await wQuery;

      const results: WorkerLiabilitySummary[] = [];
      for (const w of workers) {
        const r = await calcWorkerLiability(w.id, activeBranch?.id);
        if (r) results.push(r);
      }
      return results.sort((a, b) => b.totalLiability - a.totalLiability);
    },
  });
};

export const useAddLiabilityAdjustment = () => {
  const queryClient = useQueryClient();
  const { workerId: managerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (params: { worker_id: string; amount: number; adjustment_type: 'add' | 'subtract'; reason?: string }) => {
      const { error } = await supabase.from('worker_liability_adjustments').insert({
        worker_id: params.worker_id,
        amount: params.amount,
        adjustment_type: params.adjustment_type,
        reason: params.reason || null,
        created_by: managerId!,
        branch_id: activeBranch?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-liability'] });
      queryClient.invalidateQueries({ queryKey: ['all-workers-liability'] });
    },
  });
};