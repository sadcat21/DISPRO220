import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, ReceiptWithDetails, ReceiptModificationWithDetails, ReceiptItem, ReceiptType } from '@/types/receipt';
import { useAuth } from '@/contexts/AuthContext';

export const useReceipts = (filters?: {
  date?: string;
  dateTo?: string;
  workerId?: string;
  customerId?: string;
  receiptType?: string;
}) => {
  return useQuery({
    queryKey: ['receipts', filters],
    queryFn: async () => {
      let query = supabase
        .from('receipts')
        .select(`
          *,
          customer:customers(id, name, store_name, phone, wilaya),
          worker:workers!receipts_worker_id_fkey(id, full_name, username)
        `)
        .order('created_at', { ascending: false });

      if (filters?.date) {
        query = query.gte('created_at', `${filters.date}T00:00:00`);
        const endDate = filters.dateTo || filters.date;
        query = query.lt('created_at', `${endDate}T23:59:59`);
      }
      if (filters?.workerId) query = query.eq('worker_id', filters.workerId);
      if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
      if (filters?.receiptType && filters.receiptType !== 'all') {
        query = query.eq('receipt_type', filters.receiptType);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return (data || []) as unknown as ReceiptWithDetails[];
    },
  });
};

export const useCreateReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (receipt: {
      receipt_type: ReceiptType;
      order_id?: string | null;
      debt_id?: string | null;
      customer_id: string;
      worker_id: string;
      branch_id?: string | null;
      customer_name: string;
      customer_phone?: string | null;
      worker_name: string;
      worker_phone?: string | null;
      items: ReceiptItem[];
      total_amount: number;
      discount_amount?: number;
      paid_amount: number;
      remaining_amount: number;
      payment_method?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('receipts')
        .insert({
          receipt_type: receipt.receipt_type,
          order_id: receipt.order_id || null,
          debt_id: receipt.debt_id || null,
          customer_id: receipt.customer_id,
          worker_id: receipt.worker_id,
          branch_id: receipt.branch_id || null,
          customer_name: receipt.customer_name,
          customer_phone: receipt.customer_phone || null,
          worker_name: receipt.worker_name,
          worker_phone: receipt.worker_phone || null,
          items: receipt.items as any,
          total_amount: receipt.total_amount,
          discount_amount: receipt.discount_amount || 0,
          paid_amount: receipt.paid_amount,
          remaining_amount: receipt.remaining_amount,
          payment_method: receipt.payment_method || null,
          notes: receipt.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Receipt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
};

export const useUpdateReceiptPrintCount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { data: current } = await supabase
        .from('receipts')
        .select('print_count')
        .eq('id', receiptId)
        .single();

      const { error: updateErr } = await supabase
        .from('receipts')
        .update({
          print_count: ((current as any)?.print_count || 0) + 1,
          last_printed_at: new Date().toISOString(),
        })
        .eq('id', receiptId);

      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
};

export const useModifyReceipt = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async ({
      receiptId,
      updates,
      changesSummary,
    }: {
      receiptId: string;
      updates: Partial<Receipt>;
      changesSummary: string;
    }) => {
      const { data: original, error: fetchErr } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', receiptId)
        .single();
      if (fetchErr) throw fetchErr;

      await supabase
        .from('receipt_modifications')
        .insert([{
          receipt_id: receiptId,
          modified_by: workerId!,
          modification_type: 'edit',
          original_data: original as any,
          modified_data: { ...original, ...updates } as any,
          changes_summary: changesSummary,
        }]);

      const { items, ...safeUpdates } = updates as any;
      const updatePayload: Record<string, any> = {
        ...safeUpdates,
        is_modified: true,
        original_data: (original as any).original_data || original,
      };
      if (items) updatePayload.items = items;

      const { error: updateErr } = await supabase
        .from('receipts')
        .update(updatePayload)
        .eq('id', receiptId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-modifications'] });
    },
  });
};

export const useUnreviewedModifications = () => {
  return useQuery({
    queryKey: ['receipt-modifications', 'unreviewed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_modifications')
        .select(`*`)
        .eq('is_reviewed', false)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch modifier names and receipt data separately
      const modifierIds = [...new Set((data || []).map(d => d.modified_by))];
      const receiptIds = [...new Set((data || []).map(d => d.receipt_id))];

      const [workersRes, receiptsRes] = await Promise.all([
        supabase.from('workers').select('id, full_name').in('id', modifierIds),
        supabase.from('receipts').select('*').in('id', receiptIds),
      ]);

      const workersMap = new Map((workersRes.data || []).map(w => [w.id, w]));
      const receiptsMap = new Map((receiptsRes.data || []).map(r => [r.id, r]));
      
      return (data || []).map(d => ({
        ...d,
        modifier: workersMap.get(d.modified_by),
        receipt: receiptsMap.get(d.receipt_id),
      })) as unknown as ReceiptModificationWithDetails[];
    },
    refetchInterval: 30000,
  });
};

export const useReviewModification = () => {
  const queryClient = useQueryClient();
  const { workerId } = useAuth();

  return useMutation({
    mutationFn: async (modificationId: string) => {
      const { error } = await supabase
        .from('receipt_modifications')
        .update({
          is_reviewed: true,
          reviewed_by: workerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', modificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipt-modifications'] });
    },
  });
};
