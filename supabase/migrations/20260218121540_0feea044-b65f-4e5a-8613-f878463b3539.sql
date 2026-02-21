-- Add sales representative fields to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS sales_rep_name text,
ADD COLUMN IF NOT EXISTS sales_rep_phone text;