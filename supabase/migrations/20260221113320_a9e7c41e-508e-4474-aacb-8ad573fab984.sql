-- Fix foreign key constraint that prevents customer deletion
-- Change visit_tracking.customer_id to SET NULL on delete instead of RESTRICT
ALTER TABLE public.visit_tracking DROP CONSTRAINT IF EXISTS visit_tracking_customer_id_fkey;
ALTER TABLE public.visit_tracking ADD CONSTRAINT visit_tracking_customer_id_fkey 
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;