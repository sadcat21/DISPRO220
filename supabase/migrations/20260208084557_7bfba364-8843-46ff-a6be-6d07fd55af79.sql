
-- جدول ديون العملاء
CREATE TABLE public.customer_debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  order_id UUID REFERENCES public.orders(id),
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  branch_id UUID REFERENCES public.branches(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_paid', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- جدول مدفوعات/تحصيل الديون
CREATE TABLE public.debt_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.customer_debts(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'check', 'transfer', 'receipt')),
  notes TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تحديث updated_at تلقائياً
CREATE TRIGGER update_customer_debts_updated_at
  BEFORE UPDATE ON public.customer_debts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- فهارس للأداء
CREATE INDEX idx_customer_debts_customer_id ON public.customer_debts(customer_id);
CREATE INDEX idx_customer_debts_worker_id ON public.customer_debts(worker_id);
CREATE INDEX idx_customer_debts_branch_id ON public.customer_debts(branch_id);
CREATE INDEX idx_customer_debts_status ON public.customer_debts(status);
CREATE INDEX idx_debt_payments_debt_id ON public.debt_payments(debt_id);
CREATE INDEX idx_debt_payments_worker_id ON public.debt_payments(worker_id);

-- تفعيل RLS
ALTER TABLE public.customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

-- سياسات الديون
CREATE POLICY "Admins can do everything on customer_debts"
  ON public.customer_debts FOR ALL
  USING (public.is_admin() OR public.is_branch_admin());

CREATE POLICY "Workers can view debts"
  ON public.customer_debts FOR SELECT
  USING (public.is_worker());

CREATE POLICY "Workers can insert debts"
  ON public.customer_debts FOR INSERT
  WITH CHECK (public.is_worker());

CREATE POLICY "Workers can update their own debts"
  ON public.customer_debts FOR UPDATE
  USING (worker_id = public.get_worker_id());

-- سياسات المدفوعات
CREATE POLICY "Admins can do everything on debt_payments"
  ON public.debt_payments FOR ALL
  USING (public.is_admin() OR public.is_branch_admin());

CREATE POLICY "Workers can view debt_payments"
  ON public.debt_payments FOR SELECT
  USING (public.is_worker());

CREATE POLICY "Workers can insert debt_payments"
  ON public.debt_payments FOR INSERT
  WITH CHECK (public.is_worker());
