-- Create offer tiers table for multiple quantity tiers within single offer
CREATE TABLE public.product_offer_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.product_offers(id) ON DELETE CASCADE,
  
  -- Quantity conditions
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER,
  min_quantity_unit TEXT DEFAULT 'piece',
  
  -- Customer reward
  gift_quantity INTEGER NOT NULL DEFAULT 1,
  gift_quantity_unit TEXT DEFAULT 'piece',
  gift_type TEXT NOT NULL DEFAULT 'same_product',
  gift_product_id UUID REFERENCES public.products(id),
  discount_percentage NUMERIC,
  
  -- Worker reward for this tier
  worker_reward_type TEXT DEFAULT 'none',
  worker_reward_amount NUMERIC DEFAULT 0,
  
  -- Order within offer
  tier_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_offer_tiers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow read access to all workers" 
ON public.product_offer_tiers 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert for admins and branch admins" 
ON public.product_offer_tiers 
FOR INSERT 
WITH CHECK (public.can_manage_product_offers(public.get_worker_id()));

CREATE POLICY "Allow update for admins and branch admins" 
ON public.product_offer_tiers 
FOR UPDATE 
USING (public.can_manage_product_offers(public.get_worker_id()));

CREATE POLICY "Allow delete for admins and branch admins" 
ON public.product_offer_tiers 
FOR DELETE 
USING (public.can_manage_product_offers(public.get_worker_id()));

-- Create index for faster lookups
CREATE INDEX idx_offer_tiers_offer_id ON public.product_offer_tiers(offer_id);
CREATE INDEX idx_offer_tiers_order ON public.product_offer_tiers(offer_id, tier_order);