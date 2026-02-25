import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TreasuryEntry {
  id: string;
  branch_id: string | null;
  manager_id: string;
  session_id: string | null;
  source_type: string;
  payment_method: string;
  amount: number;
  check_number: string | null;
  check_bank: string | null;
  receipt_number: string | null;
  transfer_reference: string | null;
  notes: string | null;
  created_at: string;
  session?: { id: string; worker_id: string; worker?: { full_name: string } };
}

export interface HandoverEntry {
  id: string;
  branch_id: string | null;
  manager_id: string;
  received_by: string | null;
  payment_method: string;
  amount: number;
  check_count: number;
  receipt_count: number;
  cash_invoice1: number;
  cash_invoice2: number;
  checks_amount: number;
  receipts_amount: number;
  transfers_amount: number;
  notes: string | null;
  handover_date: string;
  created_at: string;
  receiver?: { id: string; full_name: string };
}

export interface TreasurySummary {
  cash_invoice1: number;
  cash_invoice1_count: number;
  cash_invoice1_stamp: number;
  cash_invoice2: number;
  cash_invoice2_count: number;
  check: number;
  checkCount: number;
  bank_receipt: number;
  receiptCount: number;
  bank_transfer: number;
  transferCount: number;
  total: number;
  handedOver: number;
  remaining: number;
}

export const useManagerTreasury = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['manager-treasury', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('manager_treasury')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TreasuryEntry[];
    },
  });
};

export const useTreasurySummary = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['treasury-summary', activeBranch?.id],
    queryFn: async () => {
      // Get delivered orders to calculate payment method totals
      let oQuery = supabase
        .from('orders')
        .select('id, payment_type, invoice_payment_method, payment_status, total_amount, partial_amount, order_items(total_price)')
        .eq('status', 'delivered');
      if (activeBranch?.id) oQuery = oQuery.eq('branch_id', activeBranch.id);
      const { data: orders, error: oErr } = await oQuery;
      if (oErr) throw oErr;

      // Get handovers
      let hQuery = supabase.from('manager_handovers').select('amount');
      if (activeBranch?.id) hQuery = hQuery.eq('branch_id', activeBranch.id);
      const { data: handovers, error: hErr } = await hQuery;
      if (hErr) throw hErr;

      const summary: TreasurySummary = {
        cash_invoice1: 0, cash_invoice1_count: 0, cash_invoice1_stamp: 0,
        cash_invoice2: 0, cash_invoice2_count: 0,
        check: 0, checkCount: 0,
        bank_receipt: 0, receiptCount: 0,
        bank_transfer: 0, transferCount: 0,
        total: 0, handedOver: 0, remaining: 0,
      };

      (orders || []).forEach((o: any) => {
        const amount = Number(o.total_amount || 0);
        const itemsSubtotal = (o.order_items || []).reduce((s: number, i: any) => s + Number(i.total_price || 0), 0);
        const stampAmount = Math.max(0, amount - itemsSubtotal);
        
        if (o.payment_type === 'with_invoice') {
          switch (o.invoice_payment_method) {
            case 'cash':
              summary.cash_invoice1 += amount;
              summary.cash_invoice1_count++;
              summary.cash_invoice1_stamp += stampAmount;
              break;
            case 'check':
              summary.check += amount;
              summary.checkCount++;
              break;
            case 'receipt':
              summary.bank_receipt += amount;
              summary.receiptCount++;
              break;
            case 'transfer':
              summary.bank_transfer += amount;
              summary.transferCount++;
              break;
            default:
              summary.cash_invoice1 += amount;
              summary.cash_invoice1_count++;
              summary.cash_invoice1_stamp += stampAmount;
              break;
          }
        } else {
          summary.cash_invoice2 += amount;
          summary.cash_invoice2_count++;
        }
      });

      summary.total = summary.cash_invoice1 + summary.cash_invoice2 + summary.check + summary.bank_receipt + summary.bank_transfer;
      summary.handedOver = (handovers || []).reduce((s: number, h: any) => s + Number(h.amount), 0);
      summary.remaining = summary.total - summary.handedOver;

      return summary;
    },
  });
};

export const useManagerHandovers = () => {
  const { activeBranch } = useAuth();
  return useQuery({
    queryKey: ['manager-handovers', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('manager_handovers')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as HandoverEntry[];
    },
  });
};

export const useCreateHandover = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      cash_invoice1?: number;
      cash_invoice2?: number;
      checks_amount?: number;
      check_count?: number;
      receipts_amount?: number;
      receipt_count?: number;
      transfers_amount?: number;
      transfer_count?: number;
      received_by?: string;
      notes?: string;
    }) => {
      const total = (params.cash_invoice1 || 0) + (params.cash_invoice2 || 0) + 
                    (params.checks_amount || 0) + (params.receipts_amount || 0) + 
                    (params.transfers_amount || 0);
      const { error } = await supabase.from('manager_handovers').insert({
        manager_id: workerId!,
        branch_id: activeBranch?.id || null,
        payment_method: 'mixed',
        amount: total,
        cash_invoice1: params.cash_invoice1 || 0,
        cash_invoice2: params.cash_invoice2 || 0,
        checks_amount: params.checks_amount || 0,
        check_count: params.check_count || 0,
        receipts_amount: params.receipts_amount || 0,
        receipt_count: params.receipt_count || 0,
        transfers_amount: params.transfers_amount || 0,
        transfer_count: params.transfer_count || 0,
        received_by: params.received_by || null,
        notes: params.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    },
  });
};

export const useAddTreasuryEntry = () => {
  const queryClient = useQueryClient();
  const { workerId, activeBranch } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      payment_method: string;
      amount: number;
      source_type?: string;
      session_id?: string;
      invoice_number?: string;
      check_number?: string;
      check_bank?: string;
      receipt_number?: string;
      transfer_reference?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from('manager_treasury').insert({
        manager_id: workerId!,
        branch_id: activeBranch?.id || null,
        source_type: params.source_type || 'manual',
        session_id: params.session_id || null,
        payment_method: params.payment_method,
        amount: params.amount,
        invoice_number: params.invoice_number || null,
        check_number: params.check_number || null,
        check_bank: params.check_bank || null,
        receipt_number: params.receipt_number || null,
        transfer_reference: params.transfer_reference || null,
        notes: params.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-treasury'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    },
  });
};
