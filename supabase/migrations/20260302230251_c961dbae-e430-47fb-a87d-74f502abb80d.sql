
-- جدول سجلات المداومة (الحضور والانصراف)
CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  action_type text NOT NULL CHECK (action_type IN ('clock_in', 'clock_out')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- فهارس
CREATE INDEX idx_attendance_logs_worker ON public.attendance_logs(worker_id, recorded_at DESC);
CREATE INDEX idx_attendance_logs_date ON public.attendance_logs(recorded_at DESC);

-- تفعيل RLS
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- العمال يمكنهم إدراج سجلاتهم فقط
CREATE POLICY "Workers can insert own attendance"
ON public.attendance_logs FOR INSERT TO authenticated
WITH CHECK (worker_id = public.get_worker_id());

-- العمال يرون سجلاتهم فقط
CREATE POLICY "Workers can view own attendance"
ON public.attendance_logs FOR SELECT TO authenticated
USING (worker_id = public.get_worker_id());

-- المديرون يرون الكل
CREATE POLICY "Admins can view all attendance"
ON public.attendance_logs FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_branch_admin());
