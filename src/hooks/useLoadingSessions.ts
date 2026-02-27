import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  manager?: { full_name: string };
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
  const { workerId: currentManagerId, activeBranch } = useAuth();

  const sessionsQuery = useQuery({
    queryKey: ['loading-sessions', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('loading_sessions')
        .select(`
          *,
          worker:workers!loading_sessions_worker_id_fkey(full_name),
          manager:workers!loading_sessions_manager_id_fkey(full_name)
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
      const { data, error } = await supabase
        .from('loading_sessions')
        .insert({
          worker_id: params.workerId,
          manager_id: currentManagerId!,
          branch_id: activeBranch?.id || null,
          status: 'open',
          notes: params.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
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
      // First get session items to reverse stock
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('product_id, quantity, gift_quantity, gift_unit')
        .eq('session_id', sessionId);

      if (items && items.length > 0) {
        // Reverse each item: return stock from worker to warehouse
        for (const item of items) {
          const totalQty = item.quantity + (item.gift_quantity || 0);
          
          // Reduce worker stock
          const { data: workerStock } = await supabase
            .from('worker_stock')
            .select('id, quantity')
            .eq('worker_id', workerId!)
            .eq('product_id', item.product_id)
            .single();
          
          if (workerStock) {
            await supabase
              .from('worker_stock')
              .update({ quantity: Math.max(0, workerStock.quantity - totalQty) })
              .eq('id', workerStock.id);
          }

          // Increase warehouse stock
          const branchId = activeBranch?.id;
          if (branchId) {
            const { data: whStock } = await supabase
              .from('warehouse_stock')
              .select('id, quantity')
              .eq('branch_id', branchId)
              .eq('product_id', item.product_id)
              .single();
            
            if (whStock) {
              await supabase
                .from('warehouse_stock')
                .update({ quantity: whStock.quantity + totalQty })
                .eq('id', whStock.id);
            } else {
              await supabase.from('warehouse_stock').insert({
                branch_id: branchId,
                product_id: item.product_id,
                quantity: totalQty,
              });
            }
          }
        }
      }

      // Delete session (items cascade)
      const { error } = await supabase
        .from('loading_sessions')
        .delete()
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] });
    },
  });

  const deleteSessionItem = useMutation({
    mutationFn: async (params: { itemId: string; productId: string; quantity: number; giftQuantity: number }) => {
      const totalQty = params.quantity + params.giftQuantity;
      
      // Reverse stock for this item
      const { data: workerStock } = await supabase
        .from('worker_stock')
        .select('id, quantity')
        .eq('worker_id', workerId!)
        .eq('product_id', params.productId)
        .single();
      
      if (workerStock) {
        await supabase
          .from('worker_stock')
          .update({ quantity: Math.max(0, workerStock.quantity - totalQty) })
          .eq('id', workerStock.id);
      }

      const branchId = activeBranch?.id;
      if (branchId) {
        const { data: whStock } = await supabase
          .from('warehouse_stock')
          .select('id, quantity')
          .eq('branch_id', branchId)
          .eq('product_id', params.productId)
          .single();
        
        if (whStock) {
          await supabase
            .from('warehouse_stock')
            .update({ quantity: whStock.quantity + totalQty })
            .eq('id', whStock.id);
        }
      }

      const { error } = await supabase
        .from('loading_session_items')
        .delete()
        .eq('id', params.itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] });
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
