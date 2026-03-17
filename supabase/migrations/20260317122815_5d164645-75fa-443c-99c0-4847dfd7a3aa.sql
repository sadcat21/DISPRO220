-- Add postpone_count to orders to track number of postponements
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS postpone_count integer NOT NULL DEFAULT 0;