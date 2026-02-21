-- Add UPDATE policy for order_items (missing entirely)
CREATE POLICY "Update order items"
ON public.order_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      is_admin()
      OR (o.created_by = get_worker_id() AND o.status IN ('pending', 'assigned', 'in_progress'))
      OR (o.assigned_worker_id = get_worker_id() AND o.status IN ('assigned', 'in_progress'))
      OR (is_branch_admin() AND o.branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
    )
  )
);

-- Update INSERT policy to allow assigned workers
DROP POLICY "Insert order items" ON public.order_items;
CREATE POLICY "Insert order items"
ON public.order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      is_admin()
      OR (o.created_by = get_worker_id() AND o.status IN ('pending', 'assigned', 'in_progress'))
      OR (o.assigned_worker_id = get_worker_id() AND o.status IN ('assigned', 'in_progress'))
      OR (is_branch_admin() AND o.branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
    )
  )
);

-- Update DELETE policy to allow assigned workers
DROP POLICY "Delete order items" ON public.order_items;
CREATE POLICY "Delete order items"
ON public.order_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      is_admin()
      OR (o.created_by = get_worker_id() AND o.status IN ('pending', 'assigned', 'in_progress'))
      OR (o.assigned_worker_id = get_worker_id() AND o.status IN ('assigned', 'in_progress'))
      OR (is_branch_admin() AND o.branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
    )
  )
);