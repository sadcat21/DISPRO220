-- Add internal_name column to customers table
-- This name is only visible to staff (admins, supervisors, workers) and not to customers
ALTER TABLE public.customers 
ADD COLUMN internal_name text DEFAULT NULL;

-- Add a comment to document the purpose
COMMENT ON COLUMN public.customers.internal_name IS 'Internal nickname visible only to staff, not to customers';