
-- Add document tracking fields to orders table
ALTER TABLE public.orders 
ADD COLUMN document_status text DEFAULT 'none',
ADD COLUMN document_verification jsonb DEFAULT NULL,
ADD COLUMN check_due_date date DEFAULT NULL;

-- Create index for pending documents queries
CREATE INDEX idx_orders_document_status ON public.orders(document_status) WHERE document_status = 'pending';
