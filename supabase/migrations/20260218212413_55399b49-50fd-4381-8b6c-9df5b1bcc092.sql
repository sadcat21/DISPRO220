
-- Drop existing FK constraint and re-add with ON DELETE SET NULL
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_order_id_fkey;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- Also fix product_shortage_tracking which has the same issue
ALTER TABLE product_shortage_tracking
  DROP CONSTRAINT IF EXISTS product_shortage_tracking_order_id_fkey;

ALTER TABLE product_shortage_tracking
  ADD CONSTRAINT product_shortage_tracking_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
