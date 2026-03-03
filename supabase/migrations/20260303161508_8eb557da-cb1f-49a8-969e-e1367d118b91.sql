ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS pricing_unit text DEFAULT 'box',
  ADD COLUMN IF NOT EXISTS weight_per_box numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pieces_per_box integer DEFAULT NULL;