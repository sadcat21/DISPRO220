-- Add prepaid_amount column to orders table
ALTER TABLE public.orders ADD COLUMN prepaid_amount numeric DEFAULT 0;