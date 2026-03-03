
ALTER TABLE public.product_offers ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT NULL;
ALTER TABLE public.product_offer_tiers ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT NULL;
