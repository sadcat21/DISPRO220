import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { StampPriceTier } from '@/types/stamp';
import { calculateStampAmount } from '@/hooks/useStampTiers';

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
  coins: number;
  total: number;
  handedOver: number;
  remaining: number;
  totalSales: number;
  totalDebts: number;
  collectedDebts: number;
  uncollectedDebts: number;
  debtCashCollected: number;
  totalExpenses: number;
  totalGiftsValue: number;
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
      // Get stamp tiers
      const { data: stampTiers } = await supabase
        .from('stamp_price_tiers')
        .select('*')
        .eq('is_active', true)
        .order('min_amount', { ascending: true });

      // Get delivered orders with gift data
      let oQuery = supabase
        .from('orders')
        .select('id, payment_type, invoice_payment_method, payment_status, total_amount, partial_amount, order_items(total_price, gift_quantity, unit_price)')
        .eq('status', 'delivered');
      if (activeBranch?.id) oQuery = oQuery.eq('branch_id', activeBranch.id);
      const { data: orders, error: oErr } = await oQuery;
      if (oErr) throw oErr;

      // Get handovers
      let hQuery = supabase.from('manager_handovers').select('amount');
      if (activeBranch?.id) hQuery = hQuery.eq('branch_id', activeBranch.id);
      const { data: handovers, error: hErr } = await hQuery;
      if (hErr) throw hErr;

      // Get coins from accounting sessions
      let coinQuery = supabase
        .from('accounting_session_items')
        .select('actual_amount, session_id, accounting_sessions!inner(branch_id)')
        .eq('item_type', 'coin_amount');
      if (activeBranch?.id) coinQuery = coinQuery.eq('accounting_sessions.branch_id', activeBranch.id);
      const { data: coinItems } = await coinQuery;
      const totalCoins = (coinItems || []).reduce((s: number, item: any) => s + Number(item.actual_amount || 0), 0);

      // Get debts
      let dQuery = supabase.from('customer_debts').select('total_amount, paid_amount, remaining_amount, status');
      if (activeBranch?.id) dQuery = dQuery.eq('branch_id', activeBranch.id);
      const { data: debts } = await dQuery;

      const totalDebts = (debts || []).reduce((s: number, d: any) => s + Number(d.total_amount || 0), 0);
      const collectedDebts = (debts || []).reduce((s: number, d: any) => s + Number(d.paid_amount || 0), 0);
      const uncollectedDebts = (debts || []).reduce((s: number, d: any) => s + Number(d.remaining_amount || 0), 0);

      // Get debt payments (cash collections to add to treasury)
      let dpQuery = supabase.from('debt_payments').select('amount, payment_method');
      const { data: debtPayments } = await dpQuery;
      const debtCashCollected = (debtPayments || []).reduce((s: number, dp: any) => {
        if (dp.payment_method === 'cash' || !dp.payment_method) return s + Number(dp.amount || 0);
        return s;
      }, 0);

      // Get approved expenses
      let expQuery = supabase.from('expenses').select('amount').eq('status', 'approved');
      if (activeBranch?.id) expQuery = expQuery.eq('branch_id', activeBranch.id);
      const { data: expensesData } = await expQuery;
      const totalExpenses = (expensesData || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      // Calculate total sales from all delivered orders
      const totalSales = (orders || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

      // Calculate total gift value (gifts given without payment)
      const totalGiftsValue = (orders || []).reduce((s: number, o: any) => {
        return s + (o.order_items || []).reduce((is: number, item: any) => {
          const giftQty = Number(item.gift_quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          return is + (giftQty * unitPrice);
        }, 0);
      }, 0);

      const summary: TreasurySummary = {
        cash_invoice1: 0, cash_invoice1_count: 0, cash_invoice1_stamp: 0,
        cash_invoice2: 0, cash_invoice2_count: 0,
        check: 0, checkCount: 0,
        bank_receipt: 0, receiptCount: 0,
        bank_transfer: 0, transferCount: 0,
        coins: totalCoins,
        total: 0, handedOver: 0, remaining: 0,
        totalSales, totalDebts, collectedDebts, uncollectedDebts, debtCashCollected, totalExpenses, totalGiftsValue,
      };

      (orders || []).forEach((o: any) => {
        const totalAmount = Number(o.total_amount || 0);
        const itemsSubtotal = (o.order_items || []).reduce((s: number, i: any) => s + Number(i.total_price || 0), 0);
        
        // For partial payment orders, only the paid amount goes to treasury
        // For debt orders, nothing goes to treasury from this order
        let paidAmount = totalAmount;
        if (o.payment_status === 'partial') {
          paidAmount = Number(o.partial_amount || 0);
        } else if (o.payment_status === 'debt') {
          paidAmount = 0;
        }
        
        if (paidAmount <= 0) return;

        if (o.payment_type === 'with_invoice') {
          switch (o.invoice_payment_method) {
            case 'cash': {
              summary.cash_invoice1 += paidAmount;
              summary.cash_invoice1_count++;
              if (stampTiers?.length) {
                const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : paidAmount;
                summary.cash_invoice1_stamp += calculateStampAmount(baseAmount, stampTiers as StampPriceTier[]);
              }
              break;
            }
            case 'check':
              summary.check += paidAmount;
              summary.checkCount++;
              break;
            case 'receipt':
              summary.bank_receipt += paidAmount;
              summary.receiptCount++;
              break;
            case 'transfer':
              summary.bank_transfer += paidAmount;
              summary.transferCount++;
              break;
            default:
              summary.cash_invoice1 += paidAmount;
              summary.cash_invoice1_count++;
              if (stampTiers?.length) {
                const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : paidAmount;
                summary.cash_invoice1_stamp += calculateStampAmount(baseAmount, stampTiers as StampPriceTier[]);
              }
              break;
          }
        } else {
          summary.cash_invoice2 += paidAmount;
          summary.cash_invoice2_count++;
        }
      });

      // Debt cash collections are additional cash received by manager (not invoice-related)
      // Add to total but not to any invoice category

      summary.total = summary.cash_invoice1 + summary.cash_invoice2 + summary.check + summary.bank_receipt + summary.bank_transfer + debtCashCollected;
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
      customer_name?: string;
      invoice_number?: string;
      invoice_date?: string;
      check_number?: string;
      check_bank?: string;
      check_date?: string;
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
        customer_name: params.customer_name || null,
        invoice_number: params.invoice_number || null,
        invoice_date: params.invoice_date || null,
        check_number: params.check_number || null,
        check_bank: params.check_bank || null,
        check_date: params.check_date || null,
        receipt_number: params.receipt_number || null,
        transfer_reference: params.transfer_reference || null,
        notes: params.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-treasury'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    },
  });
};
