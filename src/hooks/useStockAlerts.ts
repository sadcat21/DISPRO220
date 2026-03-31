import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/utils';

export interface StockAlert {
  worker_id: string;
  worker_name: string;
  product_id: string;
  product_name: string;
  current_stock: number;
  required_quantity: number;
  deficit: number;
}

export interface WorkerLoadSuggestion {
  product_id: string;
  product_name: string;
  current_stock: number;
  pending_orders_quantity: number;
  suggested_load: number;
}

export const useStockAlerts = () => {
  const { activeBranch, role } = useAuth();
  const queryClient = useQueryClient();
  const branchId = activeBranch?.id;
  const isAdmin = isAdminRole(role);

  // Realtime subscription for stock-related changes
  useEffect(() => {
    if (!isAdmin) return;

    const baseChannelName = 'stock-alerts-realtime';
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_stock' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_shortage_tracking' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, queryClient]);

  return useQuery({
    queryKey: ['stock-alerts', branchId],
    queryFn: async () => {
      // 1. Get all pending/assigned orders with items
      let ordersQuery = supabase
        .from('orders')
        .select(`
          id,
          assigned_worker_id,
          order_items:order_items(product_id, quantity)
        `)
        .in('status', ['pending', 'assigned', 'in_progress']);

      if (branchId) {
        ordersQuery = ordersQuery.eq('branch_id', branchId);
      }

      const { data: orders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      // 1b. Get pending shortage records to exclude from shipping gap
      let shortageQuery = supabase
        .from('product_shortage_tracking')
        .select('order_id, product_id')
        .eq('status', 'pending');
      if (branchId) shortageQuery = shortageQuery.eq('branch_id', branchId);
      const { data: shortages } = await shortageQuery;
      const shortageKeys = new Set(
        (shortages || []).map(s => `${s.order_id}::${s.product_id}`)
      );

      // 2. Get all worker stocks
      let stockQuery = supabase
        .from('worker_stock')
        .select('worker_id, product_id, quantity');

      if (branchId) {
        stockQuery = stockQuery.eq('branch_id', branchId);
      }

      const { data: workerStocks, error: stockError } = await stockQuery;
      if (stockError) throw stockError;

      // 3. Get workers info
      let workersQuery2 = supabase
        .from('workers_safe')
        .select('id, full_name')
        .eq('is_active', true);

      if (branchId) {
        workersQuery2 = workersQuery2.eq('branch_id', branchId);
      }

      // 4. Get products
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .eq('is_active', true);

      const { data: workers } = await workersQuery2;

      const productMap = new Map((products || []).map(p => [p.id, p.name]));
      const workerMap = new Map((workers || []).map(w => [w.id!, w.full_name!]));

      // Calculate required quantities per worker per product
      const requiredByWorker: Record<string, Record<string, number>> = {};

      for (const order of orders || []) {
        const workerId = order.assigned_worker_id;
        if (!workerId) continue;

        if (!requiredByWorker[workerId]) requiredByWorker[workerId] = {};

        for (const item of (order as any).order_items || []) {
          // Skip items already marked as unavailable in shortage tracking
          if (shortageKeys.has(`${order.id}::${item.product_id}`)) continue;
          requiredByWorker[workerId][item.product_id] =
            (requiredByWorker[workerId][item.product_id] || 0) + item.quantity;
        }
      }

      // Calculate stock per worker per product
      const stockByWorker: Record<string, Record<string, number>> = {};
      for (const ws of workerStocks || []) {
        if (!stockByWorker[ws.worker_id]) stockByWorker[ws.worker_id] = {};
        stockByWorker[ws.worker_id][ws.product_id] = ws.quantity;
      }

      // Find deficits
      const alerts: StockAlert[] = [];

      for (const [workerId, products] of Object.entries(requiredByWorker)) {
        for (const [productId, required] of Object.entries(products)) {
          const currentStock = stockByWorker[workerId]?.[productId] || 0;
          if (currentStock < required) {
            alerts.push({
              worker_id: workerId,
              worker_name: workerMap.get(workerId) || '',
              product_id: productId,
              product_name: productMap.get(productId) || '',
              current_stock: currentStock,
              required_quantity: required,
              deficit: required - currentStock,
            });
          }
        }
      }

      return alerts;
    },
    enabled: isAdmin,
    refetchInterval: 60000, // Refresh every minute
  });
};

export const useWorkerLoadSuggestions = (workerId: string | null) => {
  const { activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const branchId = activeBranch?.id;

  // Realtime subscription for worker-specific data
  useEffect(() => {
    if (!workerId) return;

    const channel = supabase
      .channel(`worker-suggestions-${workerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions', workerId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_stock' }, () => {
        queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions', workerId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions', workerId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workerId, queryClient]);

  return useQuery({
    queryKey: ['worker-load-suggestions', workerId, branchId],
    queryFn: async () => {
      if (!workerId) return [];

      // Get pending/assigned orders for this worker
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id,
          order_items:order_items(product_id, quantity)
        `)
        .eq('assigned_worker_id', workerId)
        .in('status', ['assigned', 'in_progress']);

      // Get worker's current stock
      const { data: workerStock } = await supabase
        .from('worker_stock')
        .select('product_id, quantity')
        .eq('worker_id', workerId);

      // Get products
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .eq('is_active', true);

      const productMap = new Map((products || []).map(p => [p.id, p.name]));
      const stockMap = new Map((workerStock || []).map(s => [s.product_id, s.quantity]));

      // Calculate required per product
      // Get pending shortage records for this worker
      let shortageQ = supabase
        .from('product_shortage_tracking')
        .select('order_id, product_id')
        .eq('status', 'pending');
      const { data: shortagesW } = await shortageQ;
      const shortageKeysW = new Set(
        (shortagesW || []).map(s => `${s.order_id}::${s.product_id}`)
      );

      const required: Record<string, number> = {};
      for (const order of orders || []) {
        for (const item of (order as any).order_items || []) {
          if (shortageKeysW.has(`${order.id}::${item.product_id}`)) continue;
          required[item.product_id] = (required[item.product_id] || 0) + item.quantity;
        }
      }

      // Build suggestions
      const suggestions: WorkerLoadSuggestion[] = [];
      const allProductIds = new Set([...Object.keys(required), ...(workerStock || []).map(s => s.product_id)]);

      for (const productId of allProductIds) {
        const currentStock = stockMap.get(productId) || 0;
        const pendingQuantity = required[productId] || 0;
        const suggested = Math.max(0, pendingQuantity - currentStock);

        if (pendingQuantity > 0 || currentStock > 0) {
          suggestions.push({
            product_id: productId,
            product_name: productMap.get(productId) || '',
            current_stock: currentStock,
            pending_orders_quantity: pendingQuantity,
            suggested_load: suggested,
          });
        }
      }

      return suggestions.sort((a, b) => b.suggested_load - a.suggested_load);
    },
    enabled: !!workerId,
  });
};
