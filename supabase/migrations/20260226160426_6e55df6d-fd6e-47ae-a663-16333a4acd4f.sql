-- Add invoice_sent_at to track when invoice was sent via WhatsApp
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_sent_at timestamp with time zone DEFAULT NULL;