
-- Create accounting_sessions table
CREATE TABLE public.accounting_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  branch_id UUID REFERENCES public.branches(id),
  manager_id UUID NOT NULL REFERENCES public.workers(id),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'disputed')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Create accounting_session_items table
CREATE TABLE public.accounting_session_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.accounting_sessions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('sales', 'cash', 'debts', 'returns', 'expenses', 'debt_collections')),
  expected_amount NUMERIC NOT NULL DEFAULT 0,
  actual_amount NUMERIC NOT NULL DEFAULT 0,
  difference NUMERIC GENERATED ALWAYS AS (actual_amount - expected_amount) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accounting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_session_items ENABLE ROW LEVEL SECURITY;

-- RLS for accounting_sessions
CREATE POLICY "Admins can manage accounting_sessions"
  ON public.accounting_sessions FOR ALL
  USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view their own sessions"
  ON public.accounting_sessions FOR SELECT
  USING (worker_id = get_worker_id());

-- RLS for accounting_session_items
CREATE POLICY "Admins can manage session_items"
  ON public.accounting_session_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.accounting_sessions s
    WHERE s.id = accounting_session_items.session_id
    AND (is_admin() OR is_branch_admin())
  ));

CREATE POLICY "Workers can view their session items"
  ON public.accounting_session_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.accounting_sessions s
    WHERE s.id = accounting_session_items.session_id
    AND s.worker_id = get_worker_id()
  ));

-- Indexes
CREATE INDEX idx_accounting_sessions_worker ON public.accounting_sessions(worker_id);
CREATE INDEX idx_accounting_sessions_branch ON public.accounting_sessions(branch_id);
CREATE INDEX idx_accounting_sessions_status ON public.accounting_sessions(status);
CREATE INDEX idx_session_items_session ON public.accounting_session_items(session_id);
