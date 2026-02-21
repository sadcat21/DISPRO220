
-- Add pricing unit fields to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS pricing_unit text NOT NULL DEFAULT 'box',
  ADD COLUMN IF NOT EXISTS weight_per_box numeric NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.products.pricing_unit IS 'Pricing unit: box, kg, or unit';
COMMENT ON COLUMN public.products.weight_per_box IS 'Weight per box in kg (used when pricing_unit is kg)';
