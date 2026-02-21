-- Add bonus columns to promos table for worker rewards
ALTER TABLE public.promos 
ADD COLUMN IF NOT EXISTS has_bonus boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS bonus_amount integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.promos.bonus_amount IS 'Worker bonus amount in Algerian Dinar (DZD)';