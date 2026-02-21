
-- Create expense categories enum-like table for flexibility
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text DEFAULT 'Receipt',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert default categories
INSERT INTO public.expense_categories (name, icon) VALUES
  ('تنقل ووقود', 'Fuel'),
  ('طعام وشراب', 'UtensilsCrossed'),
  ('صيانة', 'Wrench'),
  ('اتصالات', 'Phone'),
  ('أخرى', 'MoreHorizontal');

-- Create expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  branch_id uuid REFERENCES public.branches(id),
  category_id uuid NOT NULL REFERENCES public.expense_categories(id),
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.workers(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Categories: everyone can read
CREATE POLICY "Anyone can read expense categories"
  ON public.expense_categories FOR SELECT
  USING (true);

-- Expenses: workers see their own, admins/branch_admins see all/branch
CREATE POLICY "Workers can view own expenses"
  ON public.expenses FOR SELECT
  USING (
    worker_id = public.get_worker_id()
    OR public.is_admin()
    OR public.is_branch_admin()
  );

CREATE POLICY "Workers can create own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    worker_id = public.get_worker_id()
  );

CREATE POLICY "Workers can update own pending expenses"
  ON public.expenses FOR UPDATE
  USING (
    (worker_id = public.get_worker_id() AND status = 'pending')
    OR public.is_admin()
    OR public.is_branch_admin()
  );

CREATE POLICY "Workers can delete own pending expenses"
  ON public.expenses FOR DELETE
  USING (
    worker_id = public.get_worker_id() AND status = 'pending'
  );

-- Trigger for updated_at
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for receipts (optional uploads)
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true);

CREATE POLICY "Workers can upload receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Anyone can view receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts');

CREATE POLICY "Workers can delete own receipts"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'receipts');
