
-- جدول رصيد مدير الفرع (المستلمات من جلسات المحاسبة)
CREATE TABLE public.manager_treasury (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid REFERENCES public.branches(id),
  manager_id uuid NOT NULL REFERENCES public.workers(id),
  session_id uuid REFERENCES public.accounting_sessions(id),
  source_type text NOT NULL DEFAULT 'accounting_session', -- accounting_session, manual
  payment_method text NOT NULL, -- cash, check, bank_receipt, bank_transfer
  amount numeric NOT NULL DEFAULT 0,
  check_number text,
  check_bank text,
  receipt_number text,
  transfer_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- جدول تسليم المدير للأموال لجهة أعلى
CREATE TABLE public.manager_handovers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid REFERENCES public.branches(id),
  manager_id uuid NOT NULL REFERENCES public.workers(id),
  received_by uuid REFERENCES public.workers(id),
  payment_method text NOT NULL, -- cash, check, bank_receipt, bank_transfer
  amount numeric NOT NULL DEFAULT 0,
  check_count integer DEFAULT 0,
  receipt_count integer DEFAULT 0,
  notes text,
  handover_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manager_treasury ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_handovers ENABLE ROW LEVEL SECURITY;

-- RLS policies for manager_treasury
CREATE POLICY "Admins can manage manager_treasury"
ON public.manager_treasury FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view treasury"
ON public.manager_treasury FOR SELECT
USING (manager_id = get_worker_id());

-- RLS policies for manager_handovers
CREATE POLICY "Admins can manage manager_handovers"
ON public.manager_handovers FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view handovers"
ON public.manager_handovers FOR SELECT
USING (manager_id = get_worker_id());

-- Indexes
CREATE INDEX idx_manager_treasury_branch ON public.manager_treasury(branch_id);
CREATE INDEX idx_manager_treasury_manager ON public.manager_treasury(manager_id);
CREATE INDEX idx_manager_treasury_session ON public.manager_treasury(session_id);
CREATE INDEX idx_manager_handovers_branch ON public.manager_handovers(branch_id);
CREATE INDEX idx_manager_handovers_manager ON public.manager_handovers(manager_id);
