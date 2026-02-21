-- Drop the problematic policy
DROP POLICY IF EXISTS "View workers based on role" ON public.workers;

-- Create a simpler policy that doesn't cause recursion
-- Using the existing helper functions instead of querying workers table directly
CREATE POLICY "View workers based on role"
ON public.workers
FOR SELECT
USING (
  -- Admin sees all (using helper function)
  is_admin()
  OR
  -- Branch admin sees workers in their branch
  (
    id IN (
      SELECT w.id FROM public.workers w
      WHERE w.branch_id IN (
        SELECT b.id FROM public.branches b WHERE b.admin_id = get_worker_id()
      )
    )
  )
  OR
  -- Workers can see themselves
  id = get_worker_id()
  OR
  -- Allow anonymous read for login (since we don't use Supabase Auth)
  auth.uid() IS NULL
);