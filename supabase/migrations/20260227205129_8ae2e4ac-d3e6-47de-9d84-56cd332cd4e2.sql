
-- Customer credits/balance system
-- Tracks both financial credits (overpayment) and product credits (damaged/missing items)
CREATE TABLE public.customer_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_type text NOT NULL DEFAULT 'financial', -- 'financial' or 'product'
  -- Financial fields
  amount numeric NOT NULL DEFAULT 0,
  -- Product fields
  product_id uuid REFERENCES public.products(id),
  product_quantity integer DEFAULT 0,
  product_reason text, -- 'damaged', 'missing_delivery', 'paid_not_delivered'
  -- Approval workflow (for product credits)
  status text NOT NULL DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
  approved_by uuid REFERENCES public.workers(id),
  approved_at timestamptz,
  rejection_reason text,
  -- Common fields
  order_id uuid REFERENCES public.orders(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  branch_id uuid REFERENCES public.branches(id),
  notes text,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  used_in_order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage customer_credits"
ON public.customer_credits FOR ALL
USING (is_admin() OR is_branch_admin());

-- Workers can insert credits
CREATE POLICY "Workers can insert customer_credits"
ON public.customer_credits FOR INSERT
WITH CHECK (is_worker() AND worker_id = get_worker_id());

-- Workers can view credits
CREATE POLICY "Workers can view customer_credits"
ON public.customer_credits FOR SELECT
USING (is_worker());

-- Workers can update credits (for marking as used)
CREATE POLICY "Workers can update customer_credits"
ON public.customer_credits FOR UPDATE
USING (is_worker());

-- Indexes
CREATE INDEX idx_customer_credits_customer ON public.customer_credits(customer_id);
CREATE INDEX idx_customer_credits_status ON public.customer_credits(status);
CREATE INDEX idx_customer_credits_type ON public.customer_credits(credit_type);
CREATE INDEX idx_customer_credits_is_used ON public.customer_credits(is_used);
