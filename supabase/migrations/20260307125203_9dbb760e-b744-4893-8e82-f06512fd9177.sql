
-- Drop the failed table and recreate
DROP TABLE IF EXISTS public.sector_schedules;

CREATE TABLE public.sector_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  schedule_type text NOT NULL CHECK (schedule_type IN ('sales', 'delivery')),
  day text NOT NULL CHECK (day IN ('saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday')),
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sector_id, schedule_type, day)
);

ALTER TABLE public.sector_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view sector schedules" ON public.sector_schedules
  FOR SELECT TO authenticated USING (public.is_worker());

CREATE POLICY "Admins can manage sector schedules" ON public.sector_schedules
  FOR ALL TO authenticated USING (public.is_admin() OR public.is_branch_admin())
  WITH CHECK (public.is_admin() OR public.is_branch_admin());

-- Migrate existing data, filtering out 'none' and empty values
INSERT INTO public.sector_schedules (sector_id, schedule_type, day, worker_id)
SELECT id, 'sales', visit_day_sales, sales_worker_id
FROM public.sectors
WHERE visit_day_sales IS NOT NULL 
  AND visit_day_sales != 'none' 
  AND visit_day_sales != '';

INSERT INTO public.sector_schedules (sector_id, schedule_type, day, worker_id)
SELECT id, 'delivery', visit_day_delivery, delivery_worker_id
FROM public.sectors
WHERE visit_day_delivery IS NOT NULL 
  AND visit_day_delivery != 'none' 
  AND visit_day_delivery != '';
