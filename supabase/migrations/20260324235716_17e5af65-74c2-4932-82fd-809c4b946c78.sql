
DROP POLICY IF EXISTS "Admins can manage ui overrides" ON public.worker_ui_overrides;

CREATE POLICY "Admins can manage ui overrides"
ON public.worker_ui_overrides
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.worker_has_permission(public.get_worker_id(), 'page_permissions')
    OR (SELECT role FROM public.user_roles WHERE user_id = auth.uid())
      IN ('admin', 'project_manager', 'branch_admin', 'supervisor', 'accountant', 'admin_assistant', 'warehouse_manager')
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.worker_has_permission(public.get_worker_id(), 'page_permissions')
    OR (SELECT role FROM public.user_roles WHERE user_id = auth.uid())
      IN ('admin', 'project_manager', 'branch_admin', 'supervisor', 'accountant', 'admin_assistant', 'warehouse_manager')
  )
);
