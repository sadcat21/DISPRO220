
-- Create navbar preferences table
CREATE TABLE public.navbar_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  tab_paths TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(worker_id)
);

-- Enable RLS
ALTER TABLE public.navbar_preferences ENABLE ROW LEVEL SECURITY;

-- Workers can read/write their own preferences
CREATE POLICY "Workers can view own navbar preferences"
ON public.navbar_preferences FOR SELECT
USING (worker_id = public.get_worker_id());

CREATE POLICY "Workers can insert own navbar preferences"
ON public.navbar_preferences FOR INSERT
WITH CHECK (worker_id = public.get_worker_id());

CREATE POLICY "Workers can update own navbar preferences"
ON public.navbar_preferences FOR UPDATE
USING (worker_id = public.get_worker_id());

-- Admins can manage all
CREATE POLICY "Admins can manage all navbar preferences"
ON public.navbar_preferences FOR ALL
USING (public.is_admin() OR public.is_branch_admin());

-- Index
CREATE INDEX idx_navbar_preferences_worker_id ON public.navbar_preferences(worker_id);
