
-- Independent pallet tracking per branch
CREATE TABLE public.branch_pallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(branch_id)
);

ALTER TABLE public.branch_pallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage branch_pallets"
  ON public.branch_pallets FOR ALL
  USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view branch_pallets"
  ON public.branch_pallets FOR SELECT
  USING (is_worker());

-- Log pallet changes
CREATE TABLE public.pallet_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  quantity integer NOT NULL,
  movement_type text NOT NULL, -- 'receipt', 'delivery', 'manual_add', 'manual_subtract'
  reference_id uuid NULL,
  notes text NULL,
  created_by uuid REFERENCES public.workers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pallet_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pallet_movements"
  ON public.pallet_movements FOR ALL
  USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view pallet_movements"
  ON public.pallet_movements FOR SELECT
  USING (is_worker());
