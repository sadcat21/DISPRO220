-- Fix order f89b420f: was with_invoice + transfer but saved as without_invoice
UPDATE public.orders 
SET payment_type = 'with_invoice',
    invoice_payment_method = 'transfer',
    payment_status = 'cash'
WHERE id = 'f89b420f-722d-4138-94cc-1d796736bab6';