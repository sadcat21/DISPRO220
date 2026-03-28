
-- Fix existing warehouse_stock where factory returns were tracked but not deducted from quantity
-- Deduct factory_return_quantity that hasn't been accounted for in the main quantity
UPDATE warehouse_stock
SET quantity = GREATEST(0, quantity - COALESCE(factory_return_quantity, 0))
WHERE COALESCE(factory_return_quantity, 0) > 0;
