-- Drop and recreate INSERT policy to include warehouse_manager
DROP POLICY IF EXISTS "Admin/branch_admin can create stock receipts" ON public.stock_receipts;

CREATE POLICY "Admin/branch_admin/warehouse can create stock receipts"
ON public.stock_receipts FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role() IN ('admin'::app_role, 'branch_admin'::app_role)
  OR has_custom_role('warehouse_manager')
);

-- Also allow warehouse_manager to update (for future needs)
DROP POLICY IF EXISTS "Admin/branch_admin can update stock receipts" ON public.stock_receipts;

CREATE POLICY "Admin/branch_admin/warehouse can update stock receipts"
ON public.stock_receipts FOR UPDATE
TO authenticated
USING (
  get_user_role() IN ('admin'::app_role, 'branch_admin'::app_role)
  OR has_custom_role('warehouse_manager')
);