import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { addDays } from 'date-fns';
import { useRealtimeSubscription } from './useRealtimeSubscription';

// Map collection day keys to JS day indices (0=Sun, 6=Sat)
const DAY_KEY_TO_JS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

export interface DueDebt {
  id: string;
  customer_id: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  status: string;
  worker_id: string;
  notes: string | null;
  collection_type: string | null;
  collection_days: string[] | null;
  collection_amount: number | null;
  customer?: { id: string; name: string; store_name?: string | null; phone: string | null; latitude: number | null; longitude: number | null; customer_type?: string | null };
}

export interface DebtCollection {
  id: string;
  debt_id: string;
  worker_id: string;
  collection_date: string;
  action: 'no_payment' | 'partial_payment' | 'full_payment';
  amount_collected: number;
  payment_method: string | null;
  next_due_date: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  worker?: { id: string; full_name: string };
  debt?: {
    id: string;
    remaining_amount: number;
    customer?: { id: string; name: string };
  };
}

// Fetch debts due on a specific date for the current worker
export const useDueDebts = (targetDate?: string) => {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin' || role === 'branch_admin';
  const showAll = targetDate === '__all__';

  useRealtimeSubscription(
    'debt-collections-realtime',
    [{ table: 'customer_debts' }, { table: 'debt_collections' }],
    [['due-debts'], ['pending-collections'], ['customer-debts'], ['customer-debt-summary']],
    !!user?.id
  );

  return useQuery({
    queryKey: ['due-debts', user?.id, targetDate, isAdmin],
    queryFn: async () => {
      const dateToFilter = (!targetDate || showAll) ? new Date().toISOString().split('T')[0] : targetDate;

      let query = supabase
        .from('customer_debts')
        .select(`
          *,
          customer:customers(id, name, store_name, phone, latitude, longitude, customer_type)
        `)
        .in('status', ['active', 'partially_paid'])
        .order('due_date', { ascending: false });

      // Workers see only their own debts, admins see all
      if (!isAdmin) {
        query = query.eq('worker_id', user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filtered: typeof data;

      if (showAll) {
        // Show ALL active debts, sorted by due_date desc then remaining_amount desc
        filtered = (data || []).sort((a, b) => {
          // due_date descending (newest first)
          const dateA = a.due_date || '';
          const dateB = b.due_date || '';
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          // remaining_amount descending (largest first)
          return Number(b.remaining_amount) - Number(a.remaining_amount);
        });
      } else {
        // Filter debts using priority logic:
        // 1. If due_date matches target → always show (manual override takes priority)
        // 2. If debt has a schedule (daily/weekly), check schedule
        // 3. If no schedule, use due_date
        const targetDayJs = new Date(dateToFilter + 'T00:00:00').getDay();
        
        // Helper: check if two dates are in the same ISO week
        const sameWeek = (d1: string, d2: string) => {
          const a = new Date(d1 + 'T00:00:00');
          const b = new Date(d2 + 'T00:00:00');
          // Get Monday-based week start for both
          const getWeekStart = (dt: Date) => {
            const day = dt.getDay();
            const diff = dt.getDate() - day + (day === 0 ? -6 : 1); // Monday
            return new Date(dt.getFullYear(), dt.getMonth(), diff).getTime();
          };
          return getWeekStart(a) === getWeekStart(b);
        };

        filtered = (data || []).filter(d => {
          const hasSchedule = d.collection_type === 'daily' || 
            (d.collection_type === 'weekly' && d.collection_days?.length);
          
          // If a manual due_date is set within the same week as target date,
          // it overrides the scheduled day for that week
          const hasDueDateThisWeek = d.due_date && sameWeek(d.due_date, dateToFilter);
          
          if (hasDueDateThisWeek) {
            // Only show on the manual due_date (or earlier if overdue)
            return d.due_date! <= dateToFilter;
          }

          // No manual override this week — use schedule
          if (hasSchedule) {
            if (d.collection_type === 'daily') return true;
            if (d.collection_type === 'weekly' && d.collection_days?.length) {
              return d.collection_days.some(
                dayKey => DAY_KEY_TO_JS[dayKey] === targetDayJs
              );
            }
          }

          // Fallback: show if due_date <= target (past due)
          if (d.due_date && d.due_date <= dateToFilter) return true;

          return false;
        });
      }

      // Filter out debts that have a pending collection
      const debtIds = filtered.map(d => d.id);
      if (debtIds.length === 0) return [] as DueDebt[];

      const { data: pendingCollections } = await supabase
        .from('debt_collections')
        .select('debt_id')
        .in('debt_id', debtIds)
        .eq('status', 'pending');

      const pendingDebtIds = new Set((pendingCollections || []).map(c => c.debt_id));

      return filtered.filter(d => !pendingDebtIds.has(d.id)) as unknown as DueDebt[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
  });
};

// Fetch pending collections for admin approval
export const usePendingCollections = () => {
  const { role } = useAuth();

  return useQuery({
    queryKey: ['pending-collections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_collections')
        .select(`
          *,
          worker:workers!debt_collections_worker_id_fkey(id, full_name),
          debt:customer_debts!debt_collections_debt_id_fkey(
            id, remaining_amount,
            customer:customers(id, name, store_name)
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as DebtCollection[];
    },
    enabled: role === 'admin' || role === 'branch_admin',
  });
};

// Create a collection record
export const useCreateCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      debtId: string;
      workerId: string;
      action: 'no_payment' | 'partial_payment' | 'full_payment';
      amountCollected?: number;
      paymentMethod?: string;
      nextDueDate?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('debt_collections')
        .insert({
          debt_id: params.debtId,
          worker_id: params.workerId,
          action: params.action,
          amount_collected: params.amountCollected || 0,
          payment_method: params.paymentMethod || null,
          next_due_date: params.nextDueDate || null,
          notes: params.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['due-debts'] });
      queryClient.invalidateQueries({ queryKey: ['pending-collections'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debts'] });
    },
  });
};

// Approve or reject a collection
export const useApproveCollection = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      collectionId: string;
      approved: boolean;
      rejectionReason?: string;
    }) => {
      // Update collection status only — debt is already updated at collection time
      const updateData: Record<string, any> = {
        status: params.approved ? 'approved' : 'rejected',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      };
      if (!params.approved && params.rejectionReason) {
        updateData.rejection_reason = params.rejectionReason;
      }

      const { error: collError } = await supabase
        .from('debt_collections')
        .update(updateData)
        .eq('id', params.collectionId);

      if (collError) throw collError;

      // If rejected, reverse the debt payment that was already applied
      if (!params.approved) {
        const { data: collection } = await supabase
          .from('debt_collections')
          .select('debt_id, action, amount_collected')
          .eq('id', params.collectionId)
          .single();

        if (collection && collection.amount_collected > 0) {
          const { data: debt } = await supabase
            .from('customer_debts')
            .select('total_amount, paid_amount')
            .eq('id', collection.debt_id)
            .single();

          if (debt) {
            const newPaid = Math.max(0, Number(debt.paid_amount) - Number(collection.amount_collected));
            const newStatus = newPaid <= 0 ? 'active' : 'partially_paid';

            await supabase
              .from('customer_debts')
              .update({ paid_amount: newPaid, status: newStatus })
              .eq('id', collection.debt_id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['due-debts'] });
      queryClient.invalidateQueries({ queryKey: ['pending-collections'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debts'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debt-summary'] });
      queryClient.invalidateQueries({ queryKey: ['debt-payments'] });
    },
  });
};
