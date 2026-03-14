
-- Add stops JSONB column to worker_locations for recording stop history
ALTER TABLE public.worker_locations 
ADD COLUMN IF NOT EXISTS stops jsonb DEFAULT '[]'::jsonb;

-- Add comment for clarity
COMMENT ON COLUMN public.worker_locations.stops IS 'Array of stop records: [{lat, lng, address, started_at, ended_at, duration_min}]';
