-- Add condition_type to product_offers table
-- 'range' = من كمية X إلى كمية Y (النطاق)
-- 'multiplier' = كل X كمية = هدية (المضاعف - قابل للتكرار)
ALTER TABLE public.product_offers 
ADD COLUMN condition_type text NOT NULL DEFAULT 'range' 
CHECK (condition_type IN ('range', 'multiplier'));