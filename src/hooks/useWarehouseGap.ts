import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/utils';

export interface WarehouseGapItem {
  product_id: string;
  product_name: string;
  total_needed: number;
  warehouse_stock: number;
  deficit: number;
  order_count: number;
  customer_count: number;
  orders: { order_id: string; customer_name: string; quantity: number }[];
}

export const useWarehouseGap = () => {
  const { activeBranch, role } = useAuth();
  const queryClient = useQueryClient();
  const branchId = activeBranch?.id;
  const isAdmin = isAdminRole(role);

  // Realtime subscription
  useEffect(() => {
    if (!isAdmin) return;

    const baseChannelName = 'warehouse-gap-realtime';
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['warehouse-gap'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ['warehouse-gap'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        queryClient.invalidateQueries({ queryKey: ['warehouse-gap'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, queryClient]);

  return useQuery({
    queryKey: ['warehouse-gap', branchId],
    queryFn: async () => {
      // 1. Get all pending/assigned/in_progress orders with items and customer names
      let ordersQuery = supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          customer:customers(name),
          order_items:order_items(product_id, quantity)
        `)
        .in('status', ['pending', 'assigned', 'in_progress']);

      if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId);

      const [{ data: orders }, { data: warehouseStock }, { data: products }] = await Promise.all([
        ordersQuery,
        branchId
          ? supabase.from('warehouse_stock').select('product_id, quantity').eq('branch_id', branchId)
          : supabase.from('warehouse_stock').select('product_id, quantity'),
        supabase.from('products').select('id, name').eq('is_active', true),
      ]);

      const productMap = new Map((products || []).map(p => [p.id, p.name]));
      const stockMap = new Map<string, number>();
      for (const s of warehouseStock || []) {
        stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + s.quantity);
      }

      // Aggregate needed quantities per product
      const productNeeds: Record<string, {
        total: number;
        orderIds: Set<string>;
        customerNames: Set<string>;
        orders: { order_id: string; customer_name: string; quantity: number }[];
      }> = {};

      for (const order of orders || []) {
        const customerName = (order as any).customer?.name || '';
        for (const item of (order as any).order_items || []) {
          if (!productNeeds[item.product_id]) {
            productNeeds[item.product_id] = { total: 0, orderIds: new Set(), customerNames: new Set(), orders: [] };
          }
          productNeeds[item.product_id].total += item.quantity;
          productNeeds[item.product_id].orderIds.add(order.id);
          productNeeds[item.product_id].customerNames.add(customerName);
          productNeeds[item.product_id].orders.push({
            order_id: order.id,
            customer_name: customerName,
            quantity: item.quantity,
          });
        }
      }

      // Find products with deficit
      const gaps: WarehouseGapItem[] = [];

      for (const [productId, needs] of Object.entries(productNeeds)) {
        const warehouseQty = stockMap.get(productId) || 0;
        if (warehouseQty < needs.total) {
          gaps.push({
            product_id: productId,
            product_name: productMap.get(productId) || '',
            total_needed: needs.total,
            warehouse_stock: warehouseQty,
            deficit: needs.total - warehouseQty,
            order_count: needs.orderIds.size,
            customer_count: needs.customerNames.size,
            orders: needs.orders,
          });
        }
      }

      return gaps.sort((a, b) => b.deficit - a.deficit);
    },
    enabled: isAdmin,
    refetchInterval: 60000,
  });
};
