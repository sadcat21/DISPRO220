
-- Add default delivery worker to customers
ALTER TABLE public.customers ADD COLUMN default_delivery_worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL DEFAULT NULL;
