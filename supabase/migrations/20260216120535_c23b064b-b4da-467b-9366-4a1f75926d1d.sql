
-- Add collection schedule columns to customer_debts
ALTER TABLE public.customer_debts
  ADD COLUMN IF NOT EXISTS collection_type text DEFAULT 'none' CHECK (collection_type IN ('none', 'daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS collection_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS collection_days text[] DEFAULT NULL;

COMMENT ON COLUMN public.customer_debts.collection_type IS 'none=no schedule, daily=every day, weekly=specific days';
COMMENT ON COLUMN public.customer_debts.collection_amount IS 'Fixed amount to collect per visit';
COMMENT ON COLUMN public.customer_debts.collection_days IS 'For weekly: array of day names like [monday, wednesday]';
