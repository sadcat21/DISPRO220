
UPDATE stock_receipt_items sri
SET pallet_quantity = CEIL(sri.quantity::numeric / ps.boxes_per_pallet)
FROM pallet_settings ps
WHERE ps.product_id = sri.product_id
  AND ps.boxes_per_pallet > 0
  AND sri.pallet_quantity = 0
  AND sri.quantity > 0;
