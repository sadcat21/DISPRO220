
-- Add is_test flag to workers table
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Add index for quick filtering
CREATE INDEX IF NOT EXISTS idx_workers_is_test ON public.workers(is_test) WHERE is_test = true;
