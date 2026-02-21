
-- Add default pricing preference columns to customers table
ALTER TABLE public.customers
ADD COLUMN default_payment_type text DEFAULT 'without_invoice',
ADD COLUMN default_price_subtype text DEFAULT 'gros';

-- Add check constraints
ALTER TABLE public.customers
ADD CONSTRAINT customers_default_payment_type_check 
CHECK (default_payment_type IN ('with_invoice', 'without_invoice'));

ALTER TABLE public.customers
ADD CONSTRAINT customers_default_price_subtype_check 
CHECK (default_price_subtype IN ('super_gros', 'gros', 'retail'));
