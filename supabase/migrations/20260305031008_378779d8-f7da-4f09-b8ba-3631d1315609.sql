ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS last_device_id text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_device_info jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS device_locked boolean DEFAULT false;