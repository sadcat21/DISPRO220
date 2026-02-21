-- Add pieces_per_box column to products table
ALTER TABLE public.products 
ADD COLUMN pieces_per_box integer NOT NULL DEFAULT 1;

-- Add a comment to describe the column
COMMENT ON COLUMN public.products.pieces_per_box IS 'Number of pieces/units per box or pack';