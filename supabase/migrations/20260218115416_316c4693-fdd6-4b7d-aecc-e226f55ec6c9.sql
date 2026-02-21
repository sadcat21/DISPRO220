
-- Create sectors table
CREATE TABLE public.sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  visit_day_sales TEXT NULL, -- e.g. 'saturday', 'sunday', etc.
  visit_day_delivery TEXT NULL,
  sales_worker_id UUID REFERENCES public.workers(id) NULL,
  delivery_worker_id UUID REFERENCES public.workers(id) NULL,
  created_by UUID REFERENCES public.workers(id) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow read access to sectors" ON public.sectors
  FOR SELECT USING (true);

CREATE POLICY "Admins and branch admins can manage sectors" ON public.sectors
  FOR ALL USING (is_admin() OR is_branch_admin() OR (get_user_role() = 'supervisor'::app_role))
  WITH CHECK (is_admin() OR is_branch_admin() OR (get_user_role() = 'supervisor'::app_role));

-- Add sector_id to customers
ALTER TABLE public.customers ADD COLUMN sector_id UUID REFERENCES public.sectors(id) NULL;

-- Create index for performance
CREATE INDEX idx_customers_sector_id ON public.customers(sector_id);
CREATE INDEX idx_sectors_branch_id ON public.sectors(branch_id);
