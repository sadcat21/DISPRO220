-- Add trust badge to customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS is_trusted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS trust_notes text;

-- Create customer special prices table
CREATE TABLE public.customer_special_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  special_price NUMERIC NOT NULL,
  price_type TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' or 'discount_percent'
  notes TEXT,
  created_by UUID REFERENCES public.workers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_id, product_id)
);

-- Create quantity price tiers table
CREATE TABLE public.quantity_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER,
  tier_price NUMERIC NOT NULL,
  price_type TEXT NOT NULL DEFAULT 'unit_price', -- 'unit_price' or 'discount_percent'
  notes TEXT,
  created_by UUID REFERENCES public.workers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, min_quantity)
);

-- Enable RLS
ALTER TABLE public.customer_special_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quantity_price_tiers ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_special_prices
CREATE POLICY "View customer special prices"
ON public.customer_special_prices
FOR SELECT
USING (
  is_admin() OR 
  is_branch_admin() OR
  get_user_role() = 'supervisor'
);

CREATE POLICY "Manage customer special prices"
ON public.customer_special_prices
FOR ALL
USING (is_admin() OR is_branch_admin())
WITH CHECK (is_admin() OR is_branch_admin());

-- RLS policies for quantity_price_tiers
CREATE POLICY "View quantity price tiers"
ON public.quantity_price_tiers
FOR SELECT
USING (true);

CREATE POLICY "Manage quantity price tiers"
ON public.quantity_price_tiers
FOR ALL
USING (is_admin() OR is_branch_admin())
WITH CHECK (is_admin() OR is_branch_admin());

-- Update customers RLS for trust badge update
CREATE POLICY "Update customer trust badge"
ON public.customers
FOR UPDATE
USING (
  is_admin() OR 
  (is_branch_admin() AND branch_id IN (
    SELECT id FROM branches WHERE admin_id = get_worker_id()
  ))
);