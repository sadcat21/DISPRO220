
-- Add damaged_quantity column to warehouse_stock to track damaged/exchanged products
ALTER TABLE public.warehouse_stock ADD COLUMN IF NOT EXISTS damaged_quantity numeric NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.warehouse_stock.damaged_quantity IS 'Tracks quantity of damaged products returned via exchange sessions';
