-- إضافة حقل نوع الدفع للطلبيات
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'with_invoice' CHECK (payment_type IN ('with_invoice', 'without_invoice'));