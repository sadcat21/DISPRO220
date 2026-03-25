
-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins can manage loading_sessions" ON public.loading_sessions;

-- Create a new policy that includes warehouse_manager and supervisor
CREATE POLICY "Admins and managers can manage loading_sessions"
ON public.loading_sessions FOR ALL
TO authenticated
USING (
  is_admin() OR is_branch_admin() OR get_user_role() IN ('warehouse_manager', 'supervisor')
)
WITH CHECK (
  is_admin() OR is_branch_admin() OR get_user_role() IN ('warehouse_manager', 'supervisor')
);
