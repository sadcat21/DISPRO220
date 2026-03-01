
-- Populate branch_pallets from existing receipt data
INSERT INTO branch_pallets (branch_id, quantity)
SELECT sr.branch_id, SUM(sri.pallet_quantity)::integer
FROM stock_receipt_items sri
JOIN stock_receipts sr ON sr.id = sri.receipt_id
WHERE sri.pallet_quantity > 0 AND sr.branch_id IS NOT NULL
GROUP BY sr.branch_id
ON CONFLICT (branch_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Also deduct any pallets already sent to factory
UPDATE branch_pallets bp
SET quantity = bp.quantity - COALESCE((
  SELECT SUM(foi.pallet_quantity)::integer
  FROM factory_order_items foi
  JOIN factory_orders fo ON fo.id = foi.factory_order_id
  WHERE fo.branch_id = bp.branch_id AND fo.order_type = 'sending' AND fo.status = 'confirmed'
), 0);
