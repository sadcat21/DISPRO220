
ALTER TABLE public.worker_locations
ADD COLUMN IF NOT EXISTS idle_since timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.worker_locations.idle_since IS 'Timestamp when the worker became idle (stayed within 20m radius). NULL if moving.';
