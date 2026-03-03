
ALTER TABLE public.product_offer_tiers ADD COLUMN IF NOT EXISTS discount_prices jsonb DEFAULT NULL;
ALTER TABLE public.product_offers ADD COLUMN IF NOT EXISTS discount_prices jsonb DEFAULT NULL;
COMMENT ON COLUMN public.product_offer_tiers.discount_prices IS 'Per-price-type sale prices: {retail: number, gros: number, super_gros: number, invoice: number}';
COMMENT ON COLUMN public.product_offers.discount_prices IS 'Per-price-type sale prices for legacy compatibility';
