import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';

export interface WorkerLiabilitySummary {
  workerId: string;
  workerName: string;
  deliveredCash: number;
  debtCollectionsCash: number;
  approvedExpenses: number;
  accountedAmount: number;
  manualAdjustment: number;
  coinExchangeAmount: number;
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

  // 8. Active coin exchange tasks (coins given to this worker)
  let ceQuery = supabase
    .from('coin_exchange_tasks')
    .select('coin_amount, returned_amount')
    .eq('worker_id', workerId)
    .eq('status', 'active');
  if (branchId) ceQuery = ceQuery.eq('branch_id', branchId);
  const { data: coinTasks = [] } = await ceQuery;
  const coinExchangeAmount = coinTasks.reduce((s, t) => s + Number(t.coin_amount || 0) - Number(t.returned_amount || 0), 0);

  const totalLiability = deliveredCash + debtCollectionsCash - approvedExpenses - accountedAmount + manualAdjustment + coinExchangeAmount;

  return {
    workerId: worker.id,
    workerName: worker.full_name,
    deliveredCash,
    debtCollectionsCash,
    approvedExpenses,
    accountedAmount,
    manualAdjustment,
    coinExchangeAmount,
    totalLiability,
  };
}

export const useWorkerLiability = (workerId?: string | null) => {
  const { activeBranch } = useAuth();

  useRealtimeSubscription(
    `worker-liability-realtime-${workerId || 'all'}`,
    [
      { table: 'accounting_sessions', filter: workerId ? `worker_id=eq.${workerId}` : undefined },
      { table: 'orders', filter: workerId ? `assigned_worker_id=eq.${workerId}` : undefined },
      { table: 'debt_collections', filter: workerId ? `worker_id=eq.${workerId}` : undefined },
      { table: 'expenses', filter: workerId ? `worker_id=eq.${workerId}` : undefined },
      { table: 'worker_liability_adjustments', filter: workerId ? `worker_id=eq.${workerId}` : undefined },
      { table: 'coin_exchange_tasks', filter: workerId ? `worker_id=eq.${workerId}` : undefined },
    ],
    [
      ['worker-liability', workerId || undefined, activeBranch?.id],
      ['all-workers-liability', activeBranch?.id],
    ],
    !!workerId
  );

  return useQuery({
    queryKey: ['worker-liability', workerId, activeBranch?.id],
    queryFn: () => calcWorkerLiability(workerId!, activeBranch?.id),
    enabled: !!workerId,
  });
};

export const useAllWorkersLiability = () => {
  const { activeBranch } = useAuth();

  useRealtimeSubscription(
    `all-workers-liability-realtime-${activeBranch?.id || 'all'}`,
    [
      { table: 'workers' },
      { table: 'accounting_sessions' },
      { table: 'orders' },
      { table: 'debt_collections' },
      { table: 'expenses' },
      { table: 'worker_liability_adjustments' },
      { table: 'coin_exchange_tasks' },
    ],
    [['all-workers-liability', activeBranch?.id]],
    true
  );

  return useQuery({
    queryKey: ['all-workers-liability', activeBranch?.id],
    queryFn: async (): Promise<WorkerLiabilitySummary[]> => {
      let wQuery = supabase.from('workers').select('id, full_name').eq('is_active', true).eq('role', 'worker');
      if (activeBranch?.id) wQuery = wQuery.eq('branch_id', activeBranch.id);
      const { data: workers = [] } = await wQuery;

      const allResults = await Promise.all(
        workers.map(w => calcWorkerLiability(w.id, activeBranch?.id))
      );
      return allResults
        .filter((r): r is WorkerLiabilitySummary => r !== null)
        .sort((a, b) => b.totalLiability - a.totalLiability);
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