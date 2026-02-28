-- Add sort_order column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON public.products (sort_order);
