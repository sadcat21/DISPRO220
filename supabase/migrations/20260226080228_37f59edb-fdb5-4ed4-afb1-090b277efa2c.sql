
-- Manual adjustments for worker financial liability
CREATE TABLE public.worker_liability_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  branch_id uuid REFERENCES public.branches(id),
  amount numeric NOT NULL DEFAULT 0,
  adjustment_type text NOT NULL DEFAULT 'add', -- 'add' or 'subtract'
  reason text,
  created_by uuid NOT NULL REFERENCES public.workers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_liability_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage worker_liability_adjustments"
ON public.worker_liability_adjustments
FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view own adjustments"
ON public.worker_liability_adjustments
FOR SELECT
USING (worker_id = get_worker_id());
