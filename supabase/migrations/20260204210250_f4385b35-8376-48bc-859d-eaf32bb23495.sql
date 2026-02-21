-- Create pricing groups table
CREATE TABLE public.pricing_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.workers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create junction table for products in pricing groups
CREATE TABLE public.product_pricing_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.pricing_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, group_id)
);

-- Enable RLS
ALTER TABLE public.pricing_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_pricing_groups ENABLE ROW LEVEL SECURITY;

-- Policies for pricing_groups
CREATE POLICY "Allow read access to pricing_groups"
ON public.pricing_groups
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage pricing_groups"
ON public.pricing_groups
FOR ALL
USING (is_admin() OR is_branch_admin());

-- Policies for product_pricing_groups
CREATE POLICY "Allow read access to product_pricing_groups"
ON public.product_pricing_groups
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product_pricing_groups"
ON public.product_pricing_groups
FOR ALL
USING (is_admin() OR is_branch_admin());