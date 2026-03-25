
ALTER TABLE public.factory_orders ADD COLUMN IF NOT EXISTS pallet_count integer DEFAULT 0;

-- Allow warehouse_manager to insert/update factory_orders
DROP POLICY IF EXISTS "Admin/branch_admin can create factory orders" ON public.factory_orders;
CREATE POLICY "Admin/branch_admin/warehouse can create factory orders"
ON public.factory_orders FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role() IN ('admin'::app_role, 'branch_admin'::app_role)
  OR has_custom_role('warehouse_manager')
);

DROP POLICY IF EXISTS "Admin/branch_admin can update factory orders" ON public.factory_orders;
CREATE POLICY "Admin/branch_admin/warehouse can update factory orders"
ON public.factory_orders FOR UPDATE
TO authenticated
USING (
  get_user_role() IN ('admin'::app_role, 'branch_admin'::app_role)
  OR has_custom_role('warehouse_manager')
);

-- Allow warehouse_manager to insert factory_order_items
DROP POLICY IF EXISTS "Admin/branch_admin can create factory order items" ON public.factory_order_items;
CREATE POLICY "Admin/branch_admin/warehouse can create factory order items"
ON public.factory_order_items FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role() IN ('admin'::app_role, 'branch_admin'::app_role)
  OR has_custom_role('warehouse_manager')
);
