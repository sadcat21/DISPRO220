
-- Worker debts table
CREATE TABLE public.worker_debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  branch_id UUID REFERENCES public.branches(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  debt_type TEXT NOT NULL DEFAULT 'advance' CHECK (debt_type IN ('advance', 'deficit')),
  session_id UUID REFERENCES public.accounting_sessions(id),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'partially_paid')),
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC GENERATED ALWAYS AS (amount - paid_amount) STORED,
  created_by UUID NOT NULL REFERENCES public.workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker debt payments table
CREATE TABLE public.worker_debt_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_debt_id UUID NOT NULL REFERENCES public.worker_debts(id),
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  collected_by UUID NOT NULL REFERENCES public.workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_debt_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_debts
CREATE POLICY "Workers can view worker debts" ON public.worker_debts
  FOR SELECT USING (public.is_worker());

CREATE POLICY "Admins can insert worker debts" ON public.worker_debts
  FOR INSERT WITH CHECK (public.is_worker());

CREATE POLICY "Admins can update worker debts" ON public.worker_debts
  FOR UPDATE USING (public.is_worker());

-- RLS policies for worker_debt_payments
CREATE POLICY "Workers can view debt payments" ON public.worker_debt_payments
  FOR SELECT USING (public.is_worker());

CREATE POLICY "Admins can insert debt payments" ON public.worker_debt_payments
  FOR INSERT WITH CHECK (public.is_worker());

-- Indexes
CREATE INDEX idx_worker_debts_worker_id ON public.worker_debts(worker_id);
CREATE INDEX idx_worker_debts_session_id ON public.worker_debts(session_id);
CREATE INDEX idx_worker_debt_payments_debt_id ON public.worker_debt_payments(worker_debt_id);

-- Update trigger
CREATE TRIGGER update_worker_debts_updated_at
  BEFORE UPDATE ON public.worker_debts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
