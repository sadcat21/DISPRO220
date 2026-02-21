export interface ExpenseCategory {
  id: string;
  name: string;
  name_fr: string | null;
  name_en: string | null;
  icon: string;
  is_active: boolean;
  visible_to_roles: string[] | null;
  created_at: string;
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  worker_id: string;
  branch_id: string | null;
  category_id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  receipt_url: string | null;
  receipt_urls: string[] | null;
  status: ExpenseStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWithDetails extends Expense {
  category?: ExpenseCategory;
  worker?: { id: string; full_name: string; username: string };
  reviewer?: { id: string; full_name: string } | null;
}
