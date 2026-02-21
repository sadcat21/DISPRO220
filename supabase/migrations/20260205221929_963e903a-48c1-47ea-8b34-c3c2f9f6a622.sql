-- Add unit type columns to product_offers table
ALTER TABLE public.product_offers 
ADD COLUMN IF NOT EXISTS min_quantity_unit TEXT DEFAULT 'piece' CHECK (min_quantity_unit IN ('box', 'piece')),
ADD COLUMN IF NOT EXISTS gift_quantity_unit TEXT DEFAULT 'piece' CHECK (gift_quantity_unit IN ('box', 'piece'));