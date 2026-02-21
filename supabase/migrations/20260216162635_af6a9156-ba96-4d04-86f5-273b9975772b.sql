
-- جدول تتبع نقص المنتجات: يسجل الطلبات المرتبطة بمنتجات غير متوفرة في المخزن
CREATE TABLE public.product_shortage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  order_id UUID REFERENCES public.orders(id),
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  branch_id UUID REFERENCES public.branches(id),
  quantity_needed INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'fulfilled', 'cancelled')),
  notes TEXT,
  marked_by UUID NOT NULL REFERENCES public.workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.product_shortage_tracking ENABLE ROW LEVEL SECURITY;

-- Policies: admins and branch admins can manage
CREATE POLICY "Workers can view shortage tracking"
  ON public.product_shortage_tracking FOR SELECT
  USING (public.is_worker());

CREATE POLICY "Workers can insert shortage tracking"
  ON public.product_shortage_tracking FOR INSERT
  WITH CHECK (public.is_worker());

CREATE POLICY "Workers can update shortage tracking"
  ON public.product_shortage_tracking FOR UPDATE
  USING (public.is_worker());

CREATE POLICY "Workers can delete shortage tracking"
  ON public.product_shortage_tracking FOR DELETE
  USING (public.is_worker());

-- Index for fast lookups
CREATE INDEX idx_shortage_product_status ON public.product_shortage_tracking(product_id, status);
CREATE INDEX idx_shortage_branch ON public.product_shortage_tracking(branch_id, status);
