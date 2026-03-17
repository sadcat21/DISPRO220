import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { isAdminRole } from '@/lib/utils';

export interface PendingDocOrder {
  id: string;
  customer_id: string;
  total_amount: number;
  document_status: string;
  invoice_payment_method: string;
  doc_due_date: string | null;
  doc_collection_type: string | null;
  doc_collection_days: string[] | null;
  created_at: string;
  assigned_worker_id: string | null;
  customer?: { id: string; name: string; store_name?: string | null; phone: string | null; latitude: number | null; longitude: number | null; customer_type?: string | null; sector_id?: string | null };
}

export interface DocumentCollection {
  id: string;
  order_id: string;
  worker_id: string;
  collection_date: string;
  action: 'no_collection' | 'collected';
  next_due_date: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  worker?: { id: string; full_name: string };
  order?: {
    id: string;
    total_amount: number;
    invoice_payment_method: string;
    customer?: { id: string; name: string; store_name?: string | null; customer_type?: string | null; sector_id?: string | null };
  };
}

// Map collection day keys to JS day indices (0=Sun, 6=Sat)
const DAY_KEY_TO_JS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// Fetch pending document orders for collection
export const usePendingDocOrders = (targetDate?: string) => {
  const { user, role } = useAuth();
  const isAdmin = isAdminRole(role);
  const showAll = targetDate === '__all__';

  useRealtimeSubscription(
    'document-collections-realtime',
    [{ table: 'orders' }, { table: 'document_collections' }],
    [['pending-doc-orders'], ['pending-doc-collections']],
    !!user?.id
  );

  return useQuery({
    queryKey: ['pending-doc-orders', user?.id, targetDate, isAdmin],
    queryFn: async () => {
      const dateToFilter = (!targetDate || showAll) ? new Date().toISOString().split('T')[0] : targetDate;

      let query = supabase
        .from('orders')
        .select(`
          id, customer_id, total_amount, document_status, invoice_payment_method,
          doc_due_date, doc_collection_type, doc_collection_days,
          created_at, assigned_worker_id,
          customer:customers!orders_customer_id_fkey(id, name, store_name, phone, latitud, sector_ide, longitude, customer_type)
        `)
        .eq('document_status', 'pending')
        .eq('status', 'delivered')
        .in('invoice_payment_method', ['check', 'receipt', 'transfer'])
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('assigned_worker_id', user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filtered: typeof data;

      if (showAll) {
        filtered = data || [];
      } else {
        const targetDayJs = new Date(dateToFilter + 'T00:00:00').getDay();

        filtered = (data || []).filter(d => {
          const hasSchedule = d.doc_collection_type === 'daily' ||
            (d.doc_collection_type === 'weekly' && (d.doc_collection_days as string[] | null)?.length);

          // If doc_due_date is set and <= target date, show it
          if (d.doc_due_date && d.doc_due_date <= dateToFilter) return true;

          if (hasSchedule) {
            if (d.doc_collection_type === 'daily') return true;
            if (d.doc_collection_type === 'weekly' && (d.doc_collection_days as string[] | null)?.length) {
              return (d.doc_collection_days as string[]).some(
                dayKey => DAY_KEY_TO_JS[dayKey] === targetDayJs
              );
            }
          }

          // If no schedule and no due date, show all (new pending docs)
          if (!hasSchedule && !d.doc_due_date) return true;

          return false;
        });
      }

      // Filter out orders that have a pending document collection
      const orderIds = filtered.map(d => d.id);
      if (orderIds.length === 0) return [] as PendingDocOrder[];

      const { data: pendingCollections } = await supabase
        .from('document_collections')
        .select('order_id')
        .in('order_id', orderIds)
        .eq('status', 'pending');

      const pendingOrderIds = new Set((pendingCollections || []).map(c => c.order_id));

      return filtered.filter(d => !pendingOrderIds.has(d.id)) as unknown as PendingDocOrder[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
  });
};

// Fetch pending document collections for admin approval
export const usePendingDocCollections = () => {
  const { role } = useAuth();

  return useQuery({
    queryKey: ['pending-doc-collections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_collections')
        .select(`
          *,
          worker:workers!document_collections_worker_id_fkey(id, full_name),
          order:orders!document_collections_order_id_fkey(
            id, total_amount, invoice_payment_method,
            customer:customers!orders_customer_id_fkey(id, name, store_name, customer_type, sector_id, customer_type, sector_id)
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as DocumentCollection[];
    },
    enabled: isAdminRole(role),
  });
};

// Create a document collection record
export const useCreateDocCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      orderId: string;
      workerId: string;
      action: 'no_collection' | 'collected';
      nextDueDate?: string;
      notes?: string;
    }) => {
      // Guard: prevent duplicate collected records for the same order
      if (params.action === 'collected') {
        const { data: existing } = await supabase
          .from('document_collections')
          .select('id')
          .eq('order_id', params.orderId)
          .eq('action', 'collected')
          .in('status', ['pending', 'approved'])
          .maybeSingle();

        if (existing) {
          throw new Error('تم تحصيل هذا المستند مسبقاً');
        }
      }

      const { data, error } = await supabase
        .from('document_collections')
        .insert({
          order_id: params.orderId,
          worker_id: params.workerId,
          action: params.action,
          next_due_date: params.nextDueDate || null,
          notes: params.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // If collected, update doc_due_date on order for next visit tracking
      if (params.action === 'collected') {
        await supabase
          .from('orders')
          .update({ document_status: 'verified' })
          .eq('id', params.orderId);

        // Auto-deduct linked debt: find debt for this order and register payment
        // Only if debt is still unpaid (guard against double payment)
        const { data: linkedDebt } = await supabase
          .from('customer_debts')
          .select('id, remaining_amount, paid_amount, total_amount, status')
          .eq('order_id', params.orderId)
          .in('status', ['active', 'partially_paid'])
          .maybeSingle();

        if (linkedDebt && Number(linkedDebt.remaining_amount) > 0) {
          // Check if auto-payment already exists for this debt from doc collection
          const { data: existingPayment } = await supabase
            .from('debt_payments')
            .select('id')
            .eq('debt_id', linkedDebt.id)
            .ilike('notes', '%تسديد تلقائي - تحصيل مستند%')
            .maybeSingle();

          if (!existingPayment) {
            const { data: order } = await supabase
              .from('orders')
              .select('total_amount, invoice_payment_method')
              .eq('id', params.orderId)
              .single();

            const amountToPay = Number(linkedDebt.remaining_amount);
            const paymentMethod = order?.invoice_payment_method || 'check';

            await supabase
              .from('debt_payments')
              .insert({
                debt_id: linkedDebt.id,
                worker_id: params.workerId,
                amount: amountToPay,
                payment_method: paymentMethod,
                notes: `تسديد تلقائي - تحصيل مستند للطلبية`,
              });

            const newPaid = Number(linkedDebt.paid_amount) + amountToPay;
            const newStatus = newPaid >= Number(linkedDebt.total_amount) ? 'paid' : 'partially_paid';

            await supabase
              .from('customer_debts')
              .update({
                paid_amount: newPaid,
                status: newStatus,
              })
              .eq('id', linkedDebt.id);
          }
        }
      } else if (params.nextDueDate) {
        // Update next due date on order
        await supabase
          .from('orders')
          .update({ doc_due_date: params.nextDueDate })
          .eq('id', params.orderId);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-doc-orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-doc-collections'] });
      queryClient.invalidateQueries({ queryKey: ['pending-documents'] });
      queryClient.invalidateQueries({ queryKey: ['session-document-collections'] });
      queryClient.invalidateQueries({ queryKey: ['session-calculations'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debts'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debt-summary'] });
      queryClient.invalidateQueries({ queryKey: ['due-debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-payments'] });
    },
  });
};

// Approve or reject a document collection
export const useApproveDocCollection = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      collectionId: string;
      approved: boolean;
      rejectionReason?: string;
    }) => {
      const updateData: Record<string, any> = {
        status: params.approved ? 'approved' : 'rejected',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      };
      if (!params.approved && params.rejectionReason) {
        updateData.rejection_reason = params.rejectionReason;
      }

      const { error } = await supabase
        .from('document_collections')
        .update(updateData)
        .eq('id', params.collectionId);

      if (error) throw error;

      // If rejected and action was 'collected', revert order status
      if (!params.approved) {
        const { data: collection } = await supabase
          .from('document_collections')
          .select('order_id, action')
          .eq('id', params.collectionId)
          .single();

        if (collection && collection.action === 'collected') {
          await supabase
            .from('orders')
            .update({ document_status: 'pending' })
            .eq('id', collection.order_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-doc-orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-doc-collections'] });
      queryClient.invalidateQueries({ queryKey: ['pending-documents'] });
      queryClient.invalidateQueries({ queryKey: ['session-document-collections'] });
      queryClient.invalidateQueries({ queryKey: ['session-calculations'] });
    },
  });
};
