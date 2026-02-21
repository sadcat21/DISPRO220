-- Create settings table for storing configurable values like stamp price
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(key, branch_id)
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow admins and branch admins to read settings
CREATE POLICY "Admins can read all settings"
ON public.settings
FOR SELECT
USING (is_admin() OR is_branch_admin());

-- Allow admins to manage all settings
CREATE POLICY "Admins can manage all settings"
ON public.settings
FOR ALL
USING (is_admin());

-- Allow branch admins to manage their branch settings
CREATE POLICY "Branch admins can manage branch settings"
ON public.settings
FOR ALL
USING (
  is_branch_admin() AND 
  (branch_id IS NULL OR is_admin_of_branch(branch_id))
);

-- Add trigger for updated_at
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();