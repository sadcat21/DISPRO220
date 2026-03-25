-- Create helper function to check if current user has a specific custom role code
CREATE OR REPLACE FUNCTION public.has_custom_role(p_role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.worker_roles wr
    JOIN public.custom_roles cr ON cr.id = wr.custom_role_id
    WHERE wr.worker_id = public.get_worker_id()
      AND cr.code = p_role_code
  );
$$;

-- Drop old policy
DROP POLICY IF EXISTS "Admins and managers can manage loading_sessions" ON public.loading_sessions;

-- Recreate with custom role check
CREATE POLICY "Admins and managers can manage loading_sessions"
ON public.loading_sessions FOR ALL
TO authenticated
USING (
  is_admin() OR is_branch_admin() 
  OR get_user_role() IN ('warehouse_manager', 'supervisor')
  OR has_custom_role('warehouse_manager')
  OR has_custom_role('supervisor')
)
WITH CHECK (
  is_admin() OR is_branch_admin() 
  OR get_user_role() IN ('warehouse_manager', 'supervisor')
  OR has_custom_role('warehouse_manager')
  OR has_custom_role('supervisor')
);

-- Also fix loading_session_items policies
DROP POLICY IF EXISTS "Admins and managers can manage loading_session_items" ON public.loading_session_items;

CREATE POLICY "Admins and managers can manage loading_session_items"
ON public.loading_session_items FOR ALL
TO authenticated
USING (
  is_admin() OR is_branch_admin()
  OR get_user_role() IN ('warehouse_manager', 'supervisor')
  OR has_custom_role('warehouse_manager')
  OR has_custom_role('supervisor')
  OR EXISTS (
    SELECT 1 FROM public.loading_sessions ls
    WHERE ls.id = loading_session_items.session_id
      AND ls.worker_id = public.get_worker_id()
  )
)
WITH CHECK (
  is_admin() OR is_branch_admin()
  OR get_user_role() IN ('warehouse_manager', 'supervisor')
  OR has_custom_role('warehouse_manager')
  OR has_custom_role('supervisor')
  OR EXISTS (
    SELECT 1 FROM public.loading_sessions ls
    WHERE ls.id = loading_session_items.session_id
      AND ls.worker_id = public.get_worker_id()
  )
);