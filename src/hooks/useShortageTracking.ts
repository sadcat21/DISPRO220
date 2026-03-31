import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ShortageRecord {
  id: string;
  product_id: string;
  customer_id: string;
  order_id: string | null;
  worker_id: string;
  branch_id: string | null;
  quantity_needed: number;
  status: string;
  notes: string | null;
  marked_by: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ShortageWithDetails extends ShortageRecord {
  product?: { id: string; name: string };
  customer?: { id: string; name: string; phone: string | null; wilaya: string | null };
  worker?: { id: string; full_name: string };
}

// Fetch pending shortage records grouped by product
export const useShortageTracking = () => {
  const { activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const branchId = activeBranch?.id;

  // Realtime subscription
  useEffect(() => {
    const baseChannelName = 'shortage-tracking-realtime';
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_shortage_tracking' }, () => {
        queryClient.invalidateQueries({ queryKey: ['shortage-tracking'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        queryClient.invalidateQueries({ queryKey: ['shortage-tracking'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ['shortage-tracking', branchId],
    queryFn: async () => {
      // 1. Fetch pending shortage records
      let query = supabase
        .from('product_shortage_tracking')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (branchId) query = query.eq('branch_id', branchId);

      const { data: shortages, error } = await query;
      if (error) throw error;
      if (!shortages || shortages.length === 0) return { pending: [], available: [] };

      // 2. Get unique product IDs
      const productIds = [...new Set(shortages.map(s => s.product_id))];
      const customerIds = [...new Set(shortages.map(s => s.customer_id))];

      // 3. Fetch products, customers, and warehouse stock
      const [{ data: products }, { data: customers }, { data: warehouseStock }] = await Promise.all([
        supabase.from('products').select('id, name').in('id', productIds),
        supabase.from('customers').select('id, name, phone, wilaya').in('id', customerIds),
        branchId
          ? supabase.from('warehouse_stock').select('product_id, quantity').eq('branch_id', branchId).in('product_id', productIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const productMap = new Map((products || []).map(p => [p.id, p]));
      const customerMap = new Map((customers || []).map(c => [c.id, c]));
      const stockMap = new Map((warehouseStock || []).map(s => [s.product_id, s.quantity]));

      // Enrich records
      const enriched: ShortageWithDetails[] = shortages.map(s => ({
        ...s,
        product: productMap.get(s.product_id),
        customer: customerMap.get(s.customer_id),
      }));

      // Split into still-pending (product still unavailable) and now-available
      const pending: ShortageWithDetails[] = [];
      const available: ShortageWithDetails[] = [];

      for (const record of enriched) {
        const warehouseQty = stockMap.get(record.product_id) || 0;
        if (warehouseQty > 0) {
          available.push(record);
        } else {
          pending.push(record);
        }
      }

      return { pending, available };
    },
    refetchInterval: 60000,
  });
};

// Mark product as unavailable and track related orders
export const useMarkProductUnavailable = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async ({ productId, orders }: {
      productId: string;
      orders: { orderId: string; customerId: string; workerId: string; quantity: number }[];
    }) => {
      const records = orders.map(o => ({
        product_id: productId,
        customer_id: o.customerId,
        order_id: o.orderId,
        worker_id: o.workerId,
        branch_id: activeBranch?.id || null,
        quantity_needed: o.quantity,
        marked_by: workerId!,
        status: 'pending',
      }));

      const { error } = await supabase
        .from('product_shortage_tracking')
        .insert(records);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortage-tracking'] });
    },
  });
};

// Resolve shortage records (mark as fulfilled or cancelled)
export const useResolveShortage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: 'fulfilled' | 'cancelled' }) => {
      const { error } = await supabase
        .from('product_shortage_tracking')
        .update({ status, resolved_at: new Date().toISOString() })
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortage-tracking'] });
    },
  });
};
