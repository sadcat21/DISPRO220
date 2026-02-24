export interface CustomerDebt {
  id: string;
  customer_id: string;
  order_id: string | null;
  worker_id: string;
  branch_id: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'active' | 'partially_paid' | 'paid';
  notes: string | null;
  due_date: string | null;
  collection_type: 'none' | 'daily' | 'weekly';
  collection_amount: number | null;
  collection_days: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerDebtWithDetails extends CustomerDebt {
  customer?: { id: string; name: string; phone: string | null; wilaya: string | null; latitude?: number | null; longitude?: number | null };
  worker?: { id: string; full_name: string; username: string };
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  worker_id: string;
  amount: number;
  payment_method: 'cash' | 'check' | 'transfer' | 'receipt';
  notes: string | null;
  collected_at: string;
  created_at: string;
}

export interface DebtPaymentWithDetails extends DebtPayment {
  worker?: { id: string; full_name: string };
}
