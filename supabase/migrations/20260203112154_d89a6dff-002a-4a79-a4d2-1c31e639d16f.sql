-- Add wilaya column to customers table
ALTER TABLE public.customers 
ADD COLUMN wilaya text;

-- Rename quantity to vente_quantity and add gratuite_quantity to promos
ALTER TABLE public.promos 
RENAME COLUMN quantity TO vente_quantity;

ALTER TABLE public.promos 
ADD COLUMN gratuite_quantity integer NOT NULL DEFAULT 0;