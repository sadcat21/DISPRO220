
-- Change quantity columns from integer to numeric to support decimal values (e.g., 47.05 = 47 boxes + 1 piece)
ALTER TABLE public.warehouse_stock ALTER COLUMN quantity TYPE numeric USING quantity::numeric;
ALTER TABLE public.worker_stock ALTER COLUMN quantity TYPE numeric USING quantity::numeric;
ALTER TABLE public.stock_movements ALTER COLUMN quantity TYPE numeric USING quantity::numeric;
