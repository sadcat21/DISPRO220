-- Add pricing columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS price_super_gros numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_gros numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_invoice numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_retail numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_no_invoice numeric(10,2) DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.products.price_super_gros IS 'سعر السبر غرو';
COMMENT ON COLUMN public.products.price_gros IS 'سعر الغرو';
COMMENT ON COLUMN public.products.price_invoice IS 'سعر الفاتورة';
COMMENT ON COLUMN public.products.price_retail IS 'سعر التجزئة';
COMMENT ON COLUMN public.products.price_no_invoice IS 'سعر بدون فاتورة';

-- Add price columns to order_items for historical tracking
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price numeric(10,2) DEFAULT 0;

-- Add total_amount to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) DEFAULT 0;