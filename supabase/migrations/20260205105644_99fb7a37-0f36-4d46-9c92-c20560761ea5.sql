-- Add payment_status column to orders table
ALTER TABLE public.orders 
ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'cash', 'check', 'credit', 'partial'));

-- Add partial_amount column for partial payments
ALTER TABLE public.orders 
ADD COLUMN partial_amount NUMERIC DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.orders.payment_status IS 'Payment status: pending (قيد الانتظار), cash (كاش), check (شيك), credit (بالدين), partial (دفع جزئي)';
COMMENT ON COLUMN public.orders.partial_amount IS 'Amount paid if payment_status is partial';