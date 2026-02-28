import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PendingDocument {
  orderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  orderTotal: number;
  documentType: 'check' | 'receipt' | 'transfer';
  documentStatus: string;
  documentVerification: any;
  createdAt: string;
  assignedWorkerId: string | null;
}

export const usePendingDocuments = (branchId?: string | null) => {
  return useQuery({
    queryKey: ['pending-documents', branchId],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          total_amount,
          document_status,
          document_verification,
          invoice_payment_method,
          created_at,
          assigned_worker_id,
          customer:customers!orders_customer_id_fkey(id, name, phone)
        `)
        .eq('document_status', 'pending')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((order: any) => ({
        orderId: order.id,
        customerId: order.customer_id,
        customerName: order.customer?.name || '',
        customerPhone: order.customer?.phone || null,
        orderTotal: Number(order.total_amount || 0),
        documentType: order.invoice_payment_method as 'check' | 'receipt' | 'transfer',
        documentStatus: order.document_status,
        documentVerification: order.document_verification,
        createdAt: order.created_at,
        assignedWorkerId: order.assigned_worker_id,
      })) as PendingDocument[];
    },
  });
};
