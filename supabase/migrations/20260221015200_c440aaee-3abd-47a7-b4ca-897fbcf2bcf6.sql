
-- Create visit_tracking table for recording GPS locations during operations
CREATE TABLE public.visit_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  customer_id UUID REFERENCES public.customers(id),
  branch_id UUID REFERENCES public.branches(id),
  operation_type TEXT NOT NULL, -- 'order', 'direct_sale', 'delivery', 'add_customer', 'debt_collection'
  operation_id UUID, -- reference to the order/sale/etc id
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visit_tracking ENABLE ROW LEVEL SECURITY;

-- Admins and branch admins can view all visits
CREATE POLICY "Admins can view all visits"
  ON public.visit_tracking
  FOR SELECT
  USING (is_admin() OR is_branch_admin());

-- Workers can view their own visits
CREATE POLICY "Workers can view own visits"
  ON public.visit_tracking
  FOR SELECT
  USING (worker_id = get_worker_id());

-- Workers can insert their own visits
CREATE POLICY "Workers can insert visits"
  ON public.visit_tracking
  FOR INSERT
  WITH CHECK (is_worker() AND worker_id = get_worker_id());

-- Create indexes for performance
CREATE INDEX idx_visit_tracking_worker ON public.visit_tracking(worker_id);
CREATE INDEX idx_visit_tracking_customer ON public.visit_tracking(customer_id);
CREATE INDEX idx_visit_tracking_created_at ON public.visit_tracking(created_at DESC);
CREATE INDEX idx_visit_tracking_operation_type ON public.visit_tracking(operation_type);
