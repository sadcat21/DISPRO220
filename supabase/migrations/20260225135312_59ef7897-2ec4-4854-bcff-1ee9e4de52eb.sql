-- Add French name columns to sectors and sector_zones
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS name_fr text;
ALTER TABLE public.sector_zones ADD COLUMN IF NOT EXISTS name_fr text;