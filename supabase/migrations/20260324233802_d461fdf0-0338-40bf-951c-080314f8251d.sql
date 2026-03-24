-- Create manager_workers table for warehouse manager worker assignments
CREATE TABLE IF NOT EXISTS public.manager_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  UNIQUE(manager_id, worker_id)
);

ALTER TABLE public.manager_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view manager assignments"
  ON public.manager_workers FOR SELECT
  TO authenticated
  USING (public.is_worker());

CREATE POLICY "Admins can manage manager assignments"
  ON public.manager_workers FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());