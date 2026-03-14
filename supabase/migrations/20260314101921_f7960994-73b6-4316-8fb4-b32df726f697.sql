
-- جدول تعويض السيكتورات
CREATE TABLE public.sector_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  absent_worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  substitute_worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  coverage_type text NOT NULL DEFAULT 'full' CHECK (coverage_type IN ('full', 'split')),
  schedule_type text NOT NULL DEFAULT 'delivery' CHECK (schedule_type IN ('sales', 'delivery')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_by uuid REFERENCES public.workers(id),
  branch_id uuid REFERENCES public.branches(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookup
CREATE INDEX idx_sector_coverage_active ON public.sector_coverage (is_active, start_date, end_date);
CREATE INDEX idx_sector_coverage_substitute ON public.sector_coverage (substitute_worker_id, is_active);
CREATE INDEX idx_sector_coverage_absent ON public.sector_coverage (absent_worker_id, is_active);

-- RLS
ALTER TABLE public.sector_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view sector coverage"
  ON public.sector_coverage FOR SELECT TO authenticated
  USING (public.is_worker());

CREATE POLICY "Admins can manage sector coverage"
  ON public.sector_coverage FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_branch_admin())
  WITH CHECK (public.is_admin() OR public.is_branch_admin());

-- Auto update updated_at
CREATE TRIGGER update_sector_coverage_updated_at
  BEFORE UPDATE ON public.sector_coverage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
