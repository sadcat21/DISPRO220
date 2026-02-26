
-- Create table for manual invoice requests
CREATE TABLE public.manual_invoice_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  branch_id uuid REFERENCES public.branches(id),
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_method text,
  whatsapp_contact text,
  invoice_number text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  received_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_invoice_requests ENABLE ROW LEVEL SECURITY;

-- Admins can manage all
CREATE POLICY "Admins can manage manual_invoice_requests"
ON public.manual_invoice_requests
FOR ALL
USING (is_admin() OR is_branch_admin());

-- Workers can view their own
CREATE POLICY "Workers can view own manual_invoice_requests"
ON public.manual_invoice_requests
FOR SELECT
USING (worker_id = get_worker_id());

-- Workers can insert their own
CREATE POLICY "Workers can insert manual_invoice_requests"
ON public.manual_invoice_requests
FOR INSERT
WITH CHECK (worker_id = get_worker_id());
