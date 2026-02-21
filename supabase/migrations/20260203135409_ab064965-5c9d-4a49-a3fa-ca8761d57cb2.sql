-- Fix infinite recursion in workers SELECT policy by removing self-references
DROP POLICY IF EXISTS "View workers based on role" ON public.workers;

CREATE POLICY "View workers based on role"
ON public.workers
FOR SELECT
USING (
  -- Admin sees all
  is_admin()
  OR
  -- Branch admin (branch manager) sees workers in branches they manage
  (
    is_branch_admin()
    AND branch_id IN (
      SELECT b.id
      FROM public.branches b
      WHERE b.admin_id = get_worker_id()
        AND b.is_active = true
    )
  )
  OR
  -- Any logged-in worker can see themselves
  id = get_worker_id()
  OR
  -- Allow anonymous read for login screen flows
  auth.uid() IS NULL
);