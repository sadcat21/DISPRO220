
-- Add invoice_number and invoice_received_at to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_received_at timestamp with time zone;
