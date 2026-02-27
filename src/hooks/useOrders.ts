import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Order, OrderItem, OrderWithDetails, OrderStatus } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';

export const useOrders = () => {
  const { workerId, role, activeBranch } = useAuth();

  useRealtimeSubscription(
    'orders-realtime',
    [{ table: 'orders' }, { table: 'order_items' }],
    [['orders'], ['my-orders'], ['assigned-orders'], ['order-items']],
    !!workerId
  );

  return useQuery({
    queryKey: ['orders', workerId, role, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          created_by_worker:workers!orders_created_by_fkey(id, full_name, username),
          assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name, username)
        `)
        .order('created_at', { ascending: false });

      if (role === 'admin' && activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OrderWithDetails[];
    },
    enabled: !!workerId,
  });
};

export const useMyOrders = () => {
  const { workerId } = useAuth();

  return useQuery({
    queryKey: ['my-orders', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name, username)
        `)
        .eq('created_by', workerId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as OrderWithDetails[];
    },
    enabled: !!workerId,
  });
};

export const useAssignedOrders = () => {
  const { workerId, role, activeBranch } = useAuth();

  return useQuery({
    queryKey: ['assigned-orders', workerId, role, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*, sector:sectors(id, name, name_fr), zone:sector_zones(id, name, name_fr)),
          created_by_worker:workers!orders_created_by_fkey(id, full_name, username)
        `)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (role === 'admin' || role === 'branch_admin') {
        if (activeBranch) {
          query = query.eq('branch_id', activeBranch.id);
        }
      } else {
        query = query.eq('assigned_worker_id', workerId!);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OrderWithDetails[];
    },
    enabled: !!workerId,
  });
};

export const useOrderItems = (orderId: string | null) => {
  return useQuery({
    queryKey: ['order-items', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:products(*)
        `)
        .eq('order_id', orderId);

      if (error) throw error;
      return data as (OrderItem & { product?: any })[];
    },
    enabled: !!orderId,
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      customerId, 
      items, 
      notes, 
      deliveryDate,
      paymentType = 'with_invoice',
      invoicePaymentMethod,
      assignedWorkerId,
      totalAmount,
      prepaidAmount
    }: { 
      customerId: string; 
      items: { productId: string; quantity: number; unitPrice?: number; totalPrice?: number; giftQuantity?: number; giftOfferId?: string; itemPaymentType?: string; itemInvoicePaymentMethod?: string | null; itemPriceSubType?: string }[];
      notes?: string;
      deliveryDate?: string;
      paymentType?: 'with_invoice' | 'without_invoice';
      invoicePaymentMethod?: 'receipt' | 'check' | 'cash' | 'transfer' | null;
      assignedWorkerId?: string;
      totalAmount?: number;
      prepaidAmount?: number;
    }) => {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: customerId,
          created_by: workerId!,
          branch_id: activeBranch?.id || null,
          notes: notes || null,
          delivery_date: deliveryDate || null,
          payment_type: paymentType,
          invoice_payment_method: invoicePaymentMethod || null,
          status: assignedWorkerId ? 'assigned' : 'pending',
          assigned_worker_id: assignedWorkerId || null,
          total_amount: totalAmount || null,
          prepaid_amount: prepaidAmount || 0,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice || 0,
        total_price: item.totalPrice || 0,
        gift_quantity: item.giftQuantity || 0,
        gift_offer_id: item.giftOfferId || null,
        payment_type: item.itemPaymentType || null,
        invoice_payment_method: item.itemInvoicePaymentMethod || null,
        price_subtype: item.itemPriceSubType || null,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
    },
  });
};

export const useAssignOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, workerId }: { orderId: string; workerId: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ 
          assigned_worker_id: workerId,
          status: 'assigned' as OrderStatus 
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
    },
  });
};

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      if (status === 'delivered' && data.assigned_worker_id) {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', orderId);

        if (orderItems) {
          for (const item of orderItems) {
            const { data: ws } = await supabase
              .from('worker_stock')
              .select('id, quantity')
              .eq('worker_id', data.assigned_worker_id)
              .eq('product_id', item.product_id)
              .maybeSingle();

            if (ws && ws.quantity >= item.quantity) {
              await supabase
                .from('worker_stock')
                .update({ quantity: ws.quantity - item.quantity })
                .eq('id', ws.id);
            }

            await supabase.from('stock_movements').insert({
              product_id: item.product_id,
              branch_id: data.branch_id,
              quantity: item.quantity,
              movement_type: 'delivery',
              status: 'approved',
              created_by: workerId!,
              worker_id: data.assigned_worker_id,
              order_id: orderId,
              notes: 'خصم تلقائي عند التوصيل',
            });
          }
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
    },
  });
};

export const useDeleteOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    },
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, assigned_worker_id, status, branch_id')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);

      if (order.status === 'delivered' && order.assigned_worker_id && orderItems) {
        for (const item of orderItems) {
          const { data: ws } = await supabase
            .from('worker_stock')
            .select('id, quantity')
            .eq('worker_id', order.assigned_worker_id)
            .eq('product_id', item.product_id)
            .maybeSingle();

          if (ws) {
            await supabase
              .from('worker_stock')
              .update({ quantity: ws.quantity + item.quantity })
              .eq('id', ws.id);
          }

          await supabase
            .from('stock_movements')
            .delete()
            .eq('order_id', orderId)
            .eq('product_id', item.product_id)
            .eq('movement_type', 'delivery');
        }
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' as OrderStatus })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
    },
  });
};
