
-- Add is_registered column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_registered boolean DEFAULT false;

-- Add whatsapp contact type to treasury_contacts (reusing existing table)
-- No schema change needed, just use contact_type = 'whatsapp'
