import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from './useRealtimeSubscription';

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  details: Record<string, any> | null;
  performed_by: string | null;
  created_at: string;
  performer?: { id: string; full_name: string } | null;
}

export const useOrderEvents = (orderId: string | null) => {
  useRealtimeSubscription(
    'order-events-realtime',
    [{ table: 'order_events' }],
    [['order-events', orderId]],
    !!orderId
  );

  return useQuery({
    queryKey: ['order-events', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('order_events')
        .select('*, performer:workers!order_events_performed_by_fkey(id, full_name)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as OrderEvent[];
    },
    enabled: !!orderId,
  });
};

export const useAllOrderEvents = (filters?: { dateFrom?: string; dateTo?: string; eventType?: string; workerId?: string; createdBy?: string }) => {
  return useQuery({
    queryKey: ['all-order-events', filters],
    queryFn: async () => {
      let query = supabase
        .from('order_events')
        .select(`
          *,
          performer:workers!order_events_performed_by_fkey(id, full_name),
          order:orders!order_events_order_id_fkey(
            id, status, total_amount, customer_id, assigned_worker_id, created_by, notes, payment_type, invoice_payment_method, prepaid_amount, created_at, updated_at,
            customer:customers(name, store_name, customer_type, sector:sectors(name), zone:sector_zones(name)),
            assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name),
            created_by_worker:workers!orders_created_by_fkey(id, full_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
      }
      if (filters?.eventType && filters.eventType !== 'all') {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters?.workerId && filters.workerId !== 'all') {
        query = query.eq('performed_by', filters.workerId);
      }
      if (filters?.createdBy) {
        query = query.eq('order.created_by', filters.createdBy);
      }

      const { data, error } = await query;
      if (error) throw error;
      // If createdBy filter, remove events where order is null (filtered out by PostgREST)
      if (filters?.createdBy) {
        return (data || []).filter((e: any) => e.order !== null);
      }
      return data;
    },
  });
};

export const logOrderEvent = async (
  orderId: string,
  eventType: string,
  performedBy: string,
  opts?: { oldValue?: string; newValue?: string; details?: Record<string, any> }
) => {
  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: eventType,
    old_value: opts?.oldValue || null,
    new_value: opts?.newValue || null,
    details: opts?.details || null,
    performed_by: performedBy,
  });
};
