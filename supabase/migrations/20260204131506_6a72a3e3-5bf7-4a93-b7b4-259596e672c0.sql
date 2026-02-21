-- Add location fields to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add comment for documentation
COMMENT ON COLUMN public.customers.latitude IS 'Customer location latitude';
COMMENT ON COLUMN public.customers.longitude IS 'Customer location longitude';