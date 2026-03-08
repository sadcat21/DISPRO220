ALTER TABLE public.promos
ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.product_offers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS offer_tier_id UUID REFERENCES public.product_offer_tiers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS offer_detail TEXT,
ADD COLUMN IF NOT EXISTS gift_quantity_unit TEXT NOT NULL DEFAULT 'piece';

CREATE INDEX IF NOT EXISTS idx_promos_offer_id ON public.promos(offer_id);
CREATE INDEX IF NOT EXISTS idx_promos_offer_tier_id ON public.promos(offer_tier_id);
CREATE INDEX IF NOT EXISTS idx_promos_worker_promo_date ON public.promos(worker_id, promo_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'promos_gift_quantity_unit_check'
  ) THEN
    ALTER TABLE public.promos
      ADD CONSTRAINT promos_gift_quantity_unit_check
      CHECK (gift_quantity_unit IN ('box', 'piece'));
  END IF;
END;
$$;