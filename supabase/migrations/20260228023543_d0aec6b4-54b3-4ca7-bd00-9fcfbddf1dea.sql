
-- Create document_collections table (mirrors debt_collections pattern)
CREATE TABLE public.document_collections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  collection_date date NOT NULL DEFAULT CURRENT_DATE,
  action text NOT NULL DEFAULT 'no_collection',  -- 'no_collection' | 'collected'
  next_due_date date NULL,
  status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  approved_by uuid NULL REFERENCES public.workers(id),
  approved_at timestamptz NULL,
  rejection_reason text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Workers can create document_collections"
  ON public.document_collections FOR INSERT
  WITH CHECK (is_worker() AND worker_id = get_worker_id());

CREATE POLICY "Workers can view document_collections"
  ON public.document_collections FOR SELECT
  USING (is_worker());

CREATE POLICY "Admins can update document_collections"
  ON public.document_collections FOR UPDATE
  USING (is_admin() OR is_branch_admin());

CREATE POLICY "Admins can manage document_collections"
  ON public.document_collections FOR ALL
  USING (is_admin() OR is_branch_admin());

-- Add scheduling fields to orders for document collection
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS doc_collection_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS doc_collection_days text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS doc_due_date date DEFAULT NULL;

-- Index for performance
CREATE INDEX idx_document_collections_order_id ON public.document_collections(order_id);
CREATE INDEX idx_document_collections_status ON public.document_collections(status);
CREATE INDEX idx_orders_doc_due_date ON public.orders(doc_due_date) WHERE document_status = 'pending';
