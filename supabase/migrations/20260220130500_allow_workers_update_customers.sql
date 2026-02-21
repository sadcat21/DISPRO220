-- Allow workers who created a customer to update it (in addition to admins)
-- This migration modifies RLS policy for updates on public.customers.

-- Drop the restrictive policy if it exists
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;

-- Create a new update policy that allows admins or the worker who created the customer
CREATE POLICY "Workers can update own customers or admins" ON public.customers
  FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR created_by = public.get_worker_id())
  WITH CHECK (public.is_admin() OR created_by = public.get_worker_id());

-- Note: After deploying this migration, authenticated workers will be able to update
-- customer rows they created. If you want broader update permissions (e.g., branch admins)
-- adjust the USING/WITH CHECK expressions accordingly.
