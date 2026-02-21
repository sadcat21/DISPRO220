-- Create stamp price tiers table for tiered stamp pricing based on order total
CREATE TABLE public.stamp_price_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  min_amount NUMERIC NOT NULL,
  max_amount NUMERIC,
  percentage NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.workers(id)
);

-- Enable RLS
ALTER TABLE public.stamp_price_tiers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow read access to stamp_price_tiers"
ON public.stamp_price_tiers
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage stamp_price_tiers"
ON public.stamp_price_tiers
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Add invoice payment method to orders table
-- Values: 'receipt' (وصل تحويل), 'check' (شيك), 'cash' (كاش), 'transfer' (تحويل بنكي)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS invoice_payment_method TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.orders.invoice_payment_method IS 'Payment method for invoice orders: receipt, check, cash, transfer';

-- Insert default stamp tier (1% for 50000-99999)
INSERT INTO public.stamp_price_tiers (min_amount, max_amount, percentage, notes)
VALUES (50000, 99999, 1, 'النطاق الافتراضي: 1% للفواتير بين 50000 و 99999 دج');