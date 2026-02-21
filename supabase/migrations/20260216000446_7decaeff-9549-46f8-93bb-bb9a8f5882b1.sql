UPDATE public.orders 
SET payment_type = 'with_invoice', 
    invoice_payment_method = 'espace_cash'
WHERE id = 'c6ed573a-67fb-4312-9da7-4d315fc0b57f';