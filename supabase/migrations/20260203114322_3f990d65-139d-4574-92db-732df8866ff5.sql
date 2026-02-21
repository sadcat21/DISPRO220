-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Workers can insert own promos" ON public.promos;

-- Create a new INSERT policy that allows:
-- Workers to insert their own promos
-- Admins to insert promos for any worker
CREATE POLICY "Users can insert promos" 
ON public.promos 
FOR INSERT 
WITH CHECK (
  is_admin() OR (is_worker() AND worker_id = get_worker_id())
);