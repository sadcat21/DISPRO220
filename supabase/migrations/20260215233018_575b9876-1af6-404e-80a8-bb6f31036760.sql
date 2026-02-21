-- Fix existing direct sale order: set invoice_payment_method and correct payment_status
-- Order d07eb1b0 was a with_invoice sale paid by check but invoice_payment_method was not saved
UPDATE public.orders 
SET invoice_payment_method = 'check', 
    payment_status = 'check'
WHERE id = 'd07eb1b0-6d29-4ed0-a0b7-b0926810a62e' 
  AND payment_type = 'with_invoice' 
  AND invoice_payment_method IS NULL;