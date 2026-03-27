import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LoadingSession {
  id: string;
  worker_id: string;
  manager_id: string;
  branch_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  worker?: { full_name: string };
  manager?: { full_name: string; role?: string };
  items?: LoadingSessionItem[];
}

export interface LoadingSessionItem {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  gift_quantity: number;
  gift_unit: string | null;
  notes: string | null;
  created_at: string;
  product?: { name: string; pieces_per_box: number };
}

export const useLoadingSessions = (workerId: string | null) => {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['loading-sessions', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('loading_sessions')
        .select(`
          *,
          worker:workers!loading_sessions_worker_id_fkey(full_name),
          manager:workers!loading_sessions_manager_id_fkey(full_name, role)
        `)
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as LoadingSession[];
    },
    enabled: !!workerId,
  });

  const sessionItemsQuery = (sessionId: string) => 
    supabase
      .from('loading_session_items')
      .select('*, product:products(name, pieces_per_box)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

  const createSession = useMutation({
    mutationFn: async (params: { workerId: string; notes?: string }) => {
      const { data, error } = await (supabase.rpc as any)('start_loading_session_atomic', {
        p_worker_id: params.workerId,
        p_notes: params.notes || null,
      });
      if (error) throw error;
      const session = (data as any)?.session;
      if (!session) throw new Error('Failed to create loading session');
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
    },
  });

  const addSessionItem = useMutation({
    mutationFn: async (params: {
      sessionId: string;
      productId: string;
      quantity: number;
      giftQuantity?: number;
      giftUnit?: string;
      notes?: string;
      surplusQuantity?: number;
      isCustomLoad?: boolean;
      customLoadNote?: string;
      previousQuantity?: number;
    }) => {
      const { data, error } = await supabase
        .from('loading_session_items')
        .insert({
          session_id: params.sessionId,
          product_id: params.productId,
          quantity: params.quantity,
          gift_quantity: params.giftQuantity || 0,
          gift_unit: params.giftUnit || 'piece',
          notes: params.notes || null,
          surplus_quantity: params.surplusQuantity || 0,
          is_custom_load: params.isCustomLoad || false,
          custom_load_note: params.customLoadNote || null,
          previous_quantity: params.previousQuantity || 0,
        })
        .select('*, product:products(name, pieces_per_box)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
    },
  });

  const completeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('loading_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      // No stock reversal needed — stock changes are only applied on confirmation
      // Delete session (items cascade)
      const { error } = await supabase
        .from('loading_sessions')
        .delete()
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
    },
  });

  const deleteSessionItem = useMutation({
    mutationFn: async (params: { itemId: string; productId: string; quantity: number; giftQuantity: number }) => {
      // No stock reversal needed — stock changes are only applied on confirmation
      const { error } = await supabase
        .from('loading_session_items')
        .delete()
        .eq('id', params.itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
    },
  });

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    createSession,
    addSessionItem,
    completeSession,
    deleteSession,
    deleteSessionItem,
    sessionItemsQuery,
    refetch: sessionsQuery.refetch,
  };
};
