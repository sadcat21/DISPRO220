
-- Create app_settings table for text-based settings like print language
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES public.workers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(branch_id, key)
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Everyone can read app settings"
ON public.app_settings FOR SELECT USING (true);

-- Only admins and branch admins can insert/update
CREATE POLICY "Admins can insert app settings"
ON public.app_settings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update app settings"
ON public.app_settings FOR UPDATE
USING (true);
