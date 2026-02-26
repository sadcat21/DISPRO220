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

export const useWorkerLiability = (workerId?: string | null) => {
  const { activeBranch } = useAuth();

  return useQuery({
    queryKey: ['worker-liability', workerId, activeBranch?.id],
    queryFn: async (): Promise<WorkerLiabilitySummary | null> => {
      if (!workerId) return null;

      // 1. Get worker info
      const { data: worker } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('id', workerId)
        .single();
      if (!worker) return null;

      // 2. Delivered orders with cash payment (without_invoice = cash)
      let ordersQuery = supabase
        .from('orders')
        .select('total_amount, partial_amount, payment_status')
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered')
        .eq('payment_type', 'without_invoice');
      if (activeBranch?.id) ordersQuery = ordersQuery.eq('branch_id', activeBranch.id);
      const { data: orders = [] } = await ordersQuery;

      let deliveredCash = 0;
      for (const o of orders) {
        if (o.payment_status === 'cash') {
          deliveredCash += Number(o.total_amount || 0);
        } else if (o.payment_status === 'partial') {
          deliveredCash += Number(o.partial_amount || 0);
        }
        // credit/pending = no cash collected
      }

      // 3. Debt collections (approved, cash)
      let collectionsQuery = supabase
        .from('debt_collections')
        .select('amount_collected')
        .eq('worker_id', workerId)
        .eq('status', 'approved')
        .eq('payment_method', 'cash');
      const { data: collections = [] } = await collectionsQuery;
      const debtCollectionsCash = collections.reduce((s, c) => s + Number(c.amount_collected || 0), 0);

      // 4. Approved expenses
      let expQuery = supabase
        .from('expenses')
        .select('amount')
        .eq('worker_id', workerId)
        .eq('status', 'approved')
        .eq('payment_method', 'cash');
      if (activeBranch?.id) expQuery = expQuery.eq('branch_id', activeBranch.id);
      const { data: expenses = [] } = await expQuery;
      const approvedExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

      // 5. Accounted amounts (from accounting sessions)
      let sessQuery = supabase
        .from('accounting_sessions')
        .select('id')
        .eq('worker_id', workerId)
        .eq('status', 'completed');
      if (activeBranch?.id) sessQuery = sessQuery.eq('branch_id', activeBranch.id);
      const { data: sessions = [] } = await sessQuery;

      let accountedAmount = 0;
      if (sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        const { data: items = [] } = await supabase
          .from('accounting_session_items')
          .select('actual_amount')
          .in('session_id', sessionIds);
        accountedAmount = items.reduce((s, i) => s + Number(i.actual_amount || 0), 0);
      }

      // 6. Manual adjustments
      let adjQuery = supabase
        .from('worker_liability_adjustments')
        .select('amount, adjustment_type')
        .eq('worker_id', workerId);
      if (activeBranch?.id) adjQuery = adjQuery.eq('branch_id', activeBranch.id);
      const { data: adjustments = [] } = await adjQuery;
      const manualAdjustment = adjustments.reduce((s, a) => {
        const amt = Number(a.amount || 0);
        return s + (a.adjustment_type === 'add' ? amt : -amt);
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
    },
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
        // Simplified: fetch per worker
        let ordersQuery = supabase
          .from('orders')
          .select('total_amount, partial_amount, payment_status')
          .eq('assigned_worker_id', w.id)
          .eq('status', 'delivered')
          .eq('payment_type', 'without_invoice');
        if (activeBranch?.id) ordersQuery = ordersQuery.eq('branch_id', activeBranch.id);
        const { data: orders = [] } = await ordersQuery;

        let deliveredCash = 0;
        for (const o of orders) {
          if (o.payment_status === 'cash') deliveredCash += Number(o.total_amount || 0);
          else if (o.payment_status === 'partial') deliveredCash += Number(o.partial_amount || 0);
        }

        const { data: collections = [] } = await supabase
          .from('debt_collections')
          .select('amount_collected')
          .eq('worker_id', w.id)
          .eq('status', 'approved')
          .eq('payment_method', 'cash');
        const debtCollectionsCash = collections.reduce((s, c) => s + Number(c.amount_collected || 0), 0);

        let expQuery = supabase.from('expenses').select('amount').eq('worker_id', w.id).eq('status', 'approved').eq('payment_method', 'cash');
        if (activeBranch?.id) expQuery = expQuery.eq('branch_id', activeBranch.id);
        const { data: expenses = [] } = await expQuery;
        const approvedExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

        let sessQuery = supabase.from('accounting_sessions').select('id').eq('worker_id', w.id).eq('status', 'completed');
        if (activeBranch?.id) sessQuery = sessQuery.eq('branch_id', activeBranch.id);
        const { data: sessions = [] } = await sessQuery;
        let accountedAmount = 0;
        if (sessions.length > 0) {
          const { data: items = [] } = await supabase
            .from('accounting_session_items')
            .select('actual_amount')
            .in('session_id', sessions.map(s => s.id));
          accountedAmount = items.reduce((s, i) => s + Number(i.actual_amount || 0), 0);
        }

        let adjQuery = supabase.from('worker_liability_adjustments').select('amount, adjustment_type').eq('worker_id', w.id);
        if (activeBranch?.id) adjQuery = adjQuery.eq('branch_id', activeBranch.id);
        const { data: adjustments = [] } = await adjQuery;
        const manualAdjustment = adjustments.reduce((s, a) => {
          const amt = Number(a.amount || 0);
          return s + (a.adjustment_type === 'add' ? amt : -amt);
        }, 0);

        const totalLiability = deliveredCash + debtCollectionsCash - approvedExpenses - accountedAmount + manualAdjustment;

        results.push({
          workerId: w.id,
          workerName: w.full_name,
          deliveredCash,
          debtCollectionsCash,
          approvedExpenses,
          accountedAmount,
          manualAdjustment,
          totalLiability,
        });
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
