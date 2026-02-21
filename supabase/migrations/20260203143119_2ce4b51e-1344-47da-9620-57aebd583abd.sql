-- Drop existing SELECT policies for customers
DROP POLICY IF EXISTS "Allow read access to customers" ON public.customers;

-- Create new SELECT policy for customers with branch filtering
CREATE POLICY "View customers based on role" ON public.customers
FOR SELECT USING (
  is_admin() OR
  -- Supervisors can see all
  (get_user_role() = 'supervisor') OR
  -- Branch admins see only their branch customers
  (is_branch_admin() AND branch_id IN (
    SELECT b.id FROM branches b WHERE b.admin_id = get_worker_id() AND b.is_active = true
  )) OR
  -- Workers see only their branch customers
  (is_worker() AND branch_id = get_worker_branch_id()) OR
  -- Allow seeing customers without a branch (for admins to assign later)
  (is_admin() AND branch_id IS NULL) OR
  -- Unauthenticated access for login (needed for verify_worker_password)
  (auth.uid() IS NULL)
);