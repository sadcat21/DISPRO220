
ALTER TABLE public.pallet_settings 
ADD COLUMN IF NOT EXISTS boxes_per_layer integer NOT NULL DEFAULT 1;
