-- Add French store name column
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS store_name_fr text;
