-- Create product_offers table for promotion management
CREATE TABLE public.product_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Quantity conditions
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER, -- NULL means unlimited
  
  -- Customer reward
  gift_quantity INTEGER NOT NULL DEFAULT 0, -- Number of free items
  gift_type TEXT NOT NULL DEFAULT 'same_product', -- 'same_product', 'different_product', 'discount'
  gift_product_id UUID REFERENCES public.products(id), -- If gift is different product
  discount_percentage NUMERIC, -- If gift type is discount
  
  -- Worker reward
  worker_reward_type TEXT DEFAULT 'fixed', -- 'fixed', 'percentage', 'none'
  worker_reward_amount NUMERIC DEFAULT 0, -- Fixed amount or percentage value
  
  -- Offer behavior
  is_stackable BOOLEAN NOT NULL DEFAULT false, -- Can combine with other offers
  is_auto_apply BOOLEAN NOT NULL DEFAULT true, -- Auto-apply to orders
  
  -- Time conditions
  start_date DATE,
  end_date DATE,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0, -- Higher priority = checked first
  
  -- Branch scope
  branch_id UUID REFERENCES public.branches(id), -- NULL means all branches
  
  -- Audit
  created_by UUID REFERENCES public.workers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "View active offers" 
ON public.product_offers 
FOR SELECT 
USING (is_active = true OR is_admin() OR is_branch_admin());

CREATE POLICY "Manage offers" 
ON public.product_offers 
FOR ALL 
USING (is_admin() OR (is_branch_admin() AND (branch_id IS NULL OR branch_id IN (
  SELECT id FROM branches WHERE admin_id = get_worker_id()
))))
WITH CHECK (is_admin() OR (is_branch_admin() AND (branch_id IS NULL OR branch_id IN (
  SELECT id FROM branches WHERE admin_id = get_worker_id()
))));

-- Create index for faster lookups
CREATE INDEX idx_product_offers_product_id ON public.product_offers(product_id);
CREATE INDEX idx_product_offers_active ON public.product_offers(is_active) WHERE is_active = true;
CREATE INDEX idx_product_offers_dates ON public.product_offers(start_date, end_date);

-- Create trigger for updated_at
CREATE TRIGGER update_product_offers_updated_at
BEFORE UPDATE ON public.product_offers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();