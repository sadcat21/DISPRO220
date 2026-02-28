ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_receipt_id_fkey;

ALTER TABLE stock_movements
ADD CONSTRAINT stock_movements_receipt_id_fkey
FOREIGN KEY (receipt_id) REFERENCES stock_receipts(id) ON DELETE CASCADE;