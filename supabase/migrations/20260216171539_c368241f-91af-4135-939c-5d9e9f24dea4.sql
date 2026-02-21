
-- Table to store real-time worker locations
CREATE TABLE public.worker_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  is_tracking BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(worker_id)
);

-- Enable RLS
ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;

-- Workers can upsert their own location
CREATE POLICY "Workers can manage own location"
ON public.worker_locations
FOR ALL
USING (worker_id = get_worker_id())
WITH CHECK (worker_id = get_worker_id());

-- Admins can view all worker locations
CREATE POLICY "Admins can view worker locations"
ON public.worker_locations
FOR SELECT
USING (
  is_admin()
  OR is_branch_admin()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_locations;
