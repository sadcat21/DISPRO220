
-- Drop and recreate the INSERT policy for order_items to also allow 'delivered' status
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;

CREATE POLICY "Insert order items"
ON public.order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      is_admin()
      OR (
        (o.created_by = get_worker_id())
        AND (o.status = ANY (ARRAY['pending', 'assigned', 'in_progress', 'delivered']))
      )
      OR (
        (o.assigned_worker_id = get_worker_id())
        AND (o.status = ANY (ARRAY['assigned', 'in_progress', 'delivered']))
      )
      OR (
        is_branch_admin()
        AND (o.branch_id IN (SELECT branches.id FROM branches WHERE branches.admin_id = get_worker_id()))
      )
    )
  )
);
