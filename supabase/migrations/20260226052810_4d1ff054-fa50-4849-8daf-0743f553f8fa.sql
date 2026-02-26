
-- Add delivery method columns to manager_handovers
ALTER TABLE public.manager_handovers 
  ADD COLUMN delivery_method text NOT NULL DEFAULT 'direct',
  ADD COLUMN intermediary_name text,
  ADD COLUMN bank_transfer_reference text;

-- Create treasury_contacts table for managing receivers and intermediaries
CREATE TABLE public.treasury_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid REFERENCES public.branches(id),
  contact_type text NOT NULL, -- 'receiver' or 'intermediary'
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.workers(id)
);

ALTER TABLE public.treasury_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage treasury_contacts"
  ON public.treasury_contacts FOR ALL
  USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view treasury_contacts"
  ON public.treasury_contacts FOR SELECT
  USING (is_worker());
