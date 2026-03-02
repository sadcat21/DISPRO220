import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AccountingSessionItem {
  id: string;
  session_id: string;
  item_type: string;
  expected_amount: number;
  actual_amount: number;
  difference: number;
  notes: string | null;
  created_at: string;
}

export interface AccountingSession {
  id: string;
  worker_id: string;
  branch_id: string | null;
  manager_id: string;
  session_date: string;
  status: 'open' | 'completed' | 'disputed';
  period_start: string;
  period_end: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  worker?: { id: string; full_name: string; username: string };
  manager?: { id: string; full_name: string };
  items?: AccountingSessionItem[];
}


export const useAccountingSessions = (filters?: { status?: string }) => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['accounting-sessions', filters, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('accounting_sessions')
        .select(`
          *,
          worker:workers!accounting_sessions_worker_id_fkey(id, full_name, username),
          manager:workers!accounting_sessions_manager_id_fkey(id, full_name),
          items:accounting_session_items(*)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as AccountingSession[];
    },
  });
};

export const useSessionItems = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['session-items', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from('accounting_session_items')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at');

      if (error) throw error;
      return data as AccountingSessionItem[];
    },
    enabled: !!sessionId,
  });
};

export const useCreateSession = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      worker_id: string;
      period_start: string;
      period_end: string;
      notes?: string;
      items: { item_type: string; expected_amount: number; actual_amount: number; notes?: string }[];
    }) => {
      // Create session
      // Convert datetime-local to timestamptz with Algeria timezone (+01:00)
      const toTz = (v: string) => v.includes('T') ? v + ':00+01:00' : v + 'T00:00:00+01:00';
      
      const { data: session, error: sessionErr } = await supabase
        .from('accounting_sessions')
        .insert({
          worker_id: params.worker_id,
          manager_id: workerId!,
          branch_id: activeBranch?.id || null,
          period_start: toTz(params.period_start),
          period_end: toTz(params.period_end),
          notes: params.notes || null,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // Insert items
      const itemsData = params.items.map(item => ({
        session_id: session.id,
        item_type: item.item_type,
        expected_amount: item.expected_amount,
        actual_amount: item.actual_amount,
        notes: item.notes || null,
      }));

      const { error: itemsErr } = await supabase
        .from('accounting_session_items')
        .insert(itemsData);

      if (itemsErr) throw itemsErr;

      // Auto-insert treasury entries from session data
      const treasuryEntries: { payment_method: string; amount: number; item_type: string }[] = [];
      for (const item of params.items) {
        if (item.actual_amount <= 0) continue;
        // Map session item types to treasury payment methods
        if (item.item_type === 'invoice1_espace_cash') {
          treasuryEntries.push({ payment_method: 'cash', amount: item.actual_amount, item_type: item.item_type });
        } else if (item.item_type === 'invoice2_cash') {
          treasuryEntries.push({ payment_method: 'cash', amount: item.actual_amount, item_type: item.item_type });
        } else if (item.item_type === 'invoice1_check' || item.item_type === 'debt_collections_check') {
          treasuryEntries.push({ payment_method: 'check', amount: item.actual_amount, item_type: item.item_type });
        } else if (item.item_type === 'invoice1_receipt' || item.item_type === 'debt_collections_receipt') {
          treasuryEntries.push({ payment_method: 'bank_receipt', amount: item.actual_amount, item_type: item.item_type });
        } else if (item.item_type === 'invoice1_transfer' || item.item_type === 'debt_collections_transfer') {
          treasuryEntries.push({ payment_method: 'bank_transfer', amount: item.actual_amount, item_type: item.item_type });
        } else if (item.item_type === 'debt_collections_cash') {
          treasuryEntries.push({ payment_method: 'cash', amount: item.actual_amount, item_type: item.item_type });
        }
      }

      if (treasuryEntries.length > 0) {
        const treasuryRows = treasuryEntries.map(e => ({
          manager_id: workerId!,
          branch_id: activeBranch?.id || null,
          session_id: session.id,
          source_type: 'accounting_session',
          payment_method: e.payment_method,
          amount: e.amount,
          notes: e.item_type,
        }));
        await supabase.from('manager_treasury').insert(treasuryRows);
      }

      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['manager-treasury'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
    },
  });
};

export const useUpdateSessionStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, status, notes }: { sessionId: string; status: string; notes?: string }) => {
      const updates: any = { status };
      if (status === 'completed') updates.completed_at = new Date().toISOString();
      if (notes !== undefined) updates.notes = notes;

      const { error } = await supabase
        .from('accounting_sessions')
        .update(updates)
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-sessions'] });
    },
  });
};

export const useUpdateFullSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      session_id: string;
      period_start: string;
      period_end: string;
      notes?: string;
      items: { item_type: string; expected_amount: number; actual_amount: number; notes?: string }[];
    }) => {
      // Update session
      // Convert datetime-local to timestamptz with Algeria timezone (+01:00)
      const toTz = (v: string) => v.includes('T') ? v + ':00+01:00' : v + 'T00:00:00+01:00';
      
      const { error: sessionErr } = await supabase
        .from('accounting_sessions')
        .update({
          period_start: toTz(params.period_start),
          period_end: toTz(params.period_end),
          notes: params.notes || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', params.session_id);

      if (sessionErr) throw sessionErr;

      // Delete old items
      const { error: deleteErr } = await supabase
        .from('accounting_session_items')
        .delete()
        .eq('session_id', params.session_id);

      if (deleteErr) throw deleteErr;

      // Insert new items
      const itemsData = params.items.map(item => ({
        session_id: params.session_id,
        item_type: item.item_type,
        expected_amount: item.expected_amount,
        actual_amount: item.actual_amount,
        notes: item.notes || null,
      }));

      const { error: itemsErr } = await supabase
        .from('accounting_session_items')
        .insert(itemsData);

      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session-items'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
    },
  });
};

export const useDeleteSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await supabase.from('accounting_session_items').delete().eq('session_id', sessionId);
      const { error } = await supabase.from('accounting_sessions').delete().eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-sessions'] });
    },
  });
};
