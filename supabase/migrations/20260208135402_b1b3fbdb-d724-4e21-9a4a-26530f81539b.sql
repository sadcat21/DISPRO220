
DROP POLICY IF EXISTS "Update orders based on role" ON public.orders;

CREATE POLICY "Update orders based on role"
ON public.orders
FOR UPDATE
USING (
  is_admin()
  OR (is_branch_admin() AND branch_id IN (
    SELECT id FROM branches WHERE admin_id = get_worker_id()
  ))
  OR (get_user_role() = 'supervisor')
  OR (created_by = get_worker_id())
  OR (assigned_worker_id = get_worker_id())
);
