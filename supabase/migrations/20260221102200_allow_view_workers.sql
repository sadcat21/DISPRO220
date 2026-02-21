-- Allow all authenticated users to view worker information
-- This is needed for joins where we want to show the full_name of a worker (e.g. requester of an approval)
DROP POLICY IF EXISTS "Admins can view all workers" ON public.workers;

CREATE POLICY "Authenticated users can view workers"
ON public.workers FOR SELECT
TO authenticated
USING (true);
