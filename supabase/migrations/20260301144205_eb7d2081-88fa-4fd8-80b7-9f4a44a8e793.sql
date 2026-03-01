
-- Add name column for packaging type
ALTER TABLE public.pallet_settings ADD COLUMN IF NOT EXISTS name text;

-- Make product_id nullable
ALTER TABLE public.pallet_settings ALTER COLUMN product_id DROP NOT NULL;

-- Delete all existing pallet settings
DELETE FROM public.pallet_settings;
