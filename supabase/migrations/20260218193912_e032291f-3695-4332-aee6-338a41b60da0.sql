
-- Add per-item pricing columns to order_items
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS payment_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_payment_method text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_subtype text DEFAULT NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.order_items.payment_type IS 'Per-item payment type: with_invoice or without_invoice';
COMMENT ON COLUMN public.order_items.invoice_payment_method IS 'Per-item invoice payment method: receipt, check, cash, transfer';
COMMENT ON COLUMN public.order_items.price_subtype IS 'Per-item price subtype: super_gros, gros, retail';
