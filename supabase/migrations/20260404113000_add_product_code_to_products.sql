ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_code text;

CREATE INDEX IF NOT EXISTS idx_products_product_code
ON public.products (product_code);
