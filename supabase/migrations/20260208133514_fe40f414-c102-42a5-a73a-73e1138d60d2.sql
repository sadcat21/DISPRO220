
-- Add due_date to customer_debts
ALTER TABLE public.customer_debts ADD COLUMN IF NOT EXISTS due_date date;

-- Create debt_collections table for tracking collection attempts with approval workflow
CREATE TABLE public.debt_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES public.customer_debts(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  collection_date date NOT NULL DEFAULT CURRENT_DATE,
  action text NOT NULL DEFAULT 'no_payment' CHECK (action IN ('no_payment', 'partial_payment', 'full_payment')),
  amount_collected numeric NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('cash', 'check', 'transfer', 'receipt')),
  next_due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES public.workers(id),
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.debt_collections ENABLE ROW LEVEL SECURITY;

-- Workers can view collections
CREATE POLICY "Workers can view their collections"
  ON public.debt_collections FOR SELECT
  USING (is_worker());

-- Workers can insert their own collections
CREATE POLICY "Workers can create collections"
  ON public.debt_collections FOR INSERT
  WITH CHECK (is_worker() AND worker_id = get_worker_id());

-- Only admins/branch_admins can update (approve/reject)
CREATE POLICY "Admins can update collections"
  ON public.debt_collections FOR UPDATE
  USING (is_admin() OR is_branch_admin());

-- Indexes
CREATE INDEX idx_debt_collections_debt_id ON public.debt_collections(debt_id);
CREATE INDEX idx_debt_collections_worker_id ON public.debt_collections(worker_id);
CREATE INDEX idx_debt_collections_status ON public.debt_collections(status);
CREATE INDEX idx_customer_debts_due_date ON public.customer_debts(due_date);
