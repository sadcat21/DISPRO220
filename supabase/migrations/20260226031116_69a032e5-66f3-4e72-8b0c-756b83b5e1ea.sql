
-- Add stamp_amount column to manager_handovers
ALTER TABLE public.manager_handovers ADD COLUMN stamp_amount numeric NOT NULL DEFAULT 0;
