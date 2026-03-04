
-- Worker load requests table
CREATE TABLE public.worker_load_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'loaded')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker load request items
CREATE TABLE public.worker_load_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.worker_load_requests(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_worker_load_requests_worker ON public.worker_load_requests(worker_id);
CREATE INDEX idx_worker_load_requests_status ON public.worker_load_requests(status);
CREATE INDEX idx_worker_load_request_items_request ON public.worker_load_request_items(request_id);

-- RLS
ALTER TABLE public.worker_load_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_load_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can manage load requests" ON public.worker_load_requests
  FOR ALL TO authenticated USING (public.is_worker()) WITH CHECK (public.is_worker());

CREATE POLICY "Workers can manage load request items" ON public.worker_load_request_items
  FOR ALL TO authenticated USING (public.is_worker()) WITH CHECK (public.is_worker());

-- Updated_at trigger
CREATE TRIGGER update_worker_load_requests_updated_at
  BEFORE UPDATE ON public.worker_load_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
