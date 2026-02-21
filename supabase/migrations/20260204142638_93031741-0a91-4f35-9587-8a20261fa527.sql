-- Add location_type column to customers table
ALTER TABLE public.customers 
ADD COLUMN location_type TEXT DEFAULT 'store' CHECK (location_type IN ('home', 'store', 'office'));