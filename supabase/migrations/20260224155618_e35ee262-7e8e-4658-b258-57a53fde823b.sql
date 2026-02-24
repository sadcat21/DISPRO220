
-- Table to store UI element visibility overrides per worker
CREATE TABLE public.worker_ui_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  element_type text NOT NULL, -- 'page' or 'button'
  element_key text NOT NULL, -- path like '/orders' or button key like 'direct_sale'
  is_hidden boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.workers(id),
  UNIQUE(worker_id, element_type, element_key)
);

-- Enable RLS
ALTER TABLE public.worker_ui_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can manage all overrides
CREATE POLICY "Admins can manage ui overrides"
ON public.worker_ui_overrides
FOR ALL
USING (is_admin() OR is_branch_admin())
WITH CHECK (is_admin() OR is_branch_admin());

-- Workers can view their own overrides
CREATE POLICY "Workers can view own ui overrides"
ON public.worker_ui_overrides
FOR SELECT
USING (worker_id = get_worker_id());

-- Index for fast lookups
CREATE INDEX idx_worker_ui_overrides_worker ON public.worker_ui_overrides(worker_id);
