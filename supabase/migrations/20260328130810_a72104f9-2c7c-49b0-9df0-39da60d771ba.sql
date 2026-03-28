
-- Fix: Change integer columns to numeric to support box.piece fractional quantities
ALTER TABLE stock_receipt_items ALTER COLUMN quantity TYPE numeric USING quantity::numeric;
ALTER TABLE stock_receipts ALTER COLUMN total_items TYPE numeric USING total_items::numeric;
ALTER TABLE factory_order_items ALTER COLUMN product_quantity TYPE numeric USING product_quantity::numeric;
ALTER TABLE factory_order_items ALTER COLUMN pallet_quantity TYPE numeric USING pallet_quantity::numeric;
