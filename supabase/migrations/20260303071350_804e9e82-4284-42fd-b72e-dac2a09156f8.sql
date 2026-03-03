
-- Table to store per-worker custom attendance location
CREATE TABLE public.worker_attendance_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  max_distance_meters INTEGER NOT NULL DEFAULT 50,
  label TEXT,
  set_by UUID REFERENCES public.workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_id)
);

ALTER TABLE public.worker_attendance_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage worker attendance locations"
ON public.worker_attendance_locations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'branch_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'branch_admin')
  )
);

CREATE POLICY "Workers can view their own attendance location"
ON public.worker_attendance_locations
FOR SELECT
TO authenticated
USING (worker_id = public.get_worker_id());

CREATE TRIGGER update_worker_attendance_locations_updated_at
BEFORE UPDATE ON public.worker_attendance_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
