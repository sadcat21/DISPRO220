
-- Update order_items UPDATE policy to allow workers to update items on delivered orders
DROP POLICY IF EXISTS "Update order items" ON order_items;
CREATE POLICY "Update order items" ON order_items FOR UPDATE
USING (EXISTS ( SELECT 1 FROM orders o
  WHERE ((o.id = order_items.order_id) AND (is_admin() OR 
    ((o.created_by = get_worker_id()) AND (o.status = ANY (ARRAY['pending','assigned','in_progress','delivered']))) OR 
    ((o.assigned_worker_id = get_worker_id()) AND (o.status = ANY (ARRAY['assigned','in_progress','delivered']))) OR 
    (is_branch_admin() AND (o.branch_id IN ( SELECT branches.id FROM branches WHERE (branches.admin_id = get_worker_id()))))))));

-- Update order_items DELETE policy to allow workers to delete items on delivered orders
DROP POLICY IF EXISTS "Delete order items" ON order_items;
CREATE POLICY "Delete order items" ON order_items FOR DELETE
USING (EXISTS ( SELECT 1 FROM orders o
  WHERE ((o.id = order_items.order_id) AND (is_admin() OR 
    ((o.created_by = get_worker_id()) AND (o.status = ANY (ARRAY['pending','assigned','in_progress','delivered']))) OR 
    ((o.assigned_worker_id = get_worker_id()) AND (o.status = ANY (ARRAY['assigned','in_progress','delivered']))) OR 
    (is_branch_admin() AND (o.branch_id IN ( SELECT branches.id FROM branches WHERE (branches.admin_id = get_worker_id()))))))));
