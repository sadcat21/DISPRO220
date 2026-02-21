UPDATE public.orders 
SET payment_type = 'with_invoice', 
    invoice_payment_method = 'transfer'
WHERE id = '7d5a6a32-306f-4cc7-8e01-881490a199e1';