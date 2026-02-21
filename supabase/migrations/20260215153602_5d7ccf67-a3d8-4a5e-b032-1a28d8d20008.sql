
-- Add payment_method column to expenses table for fuel payment tracking (card vs cash)
ALTER TABLE public.expenses ADD COLUMN payment_method text DEFAULT 'cash';

-- Add comment for clarity
COMMENT ON COLUMN public.expenses.payment_method IS 'Payment method: cash or card. Only cash expenses are deducted from physical cash in accounting sessions.';
