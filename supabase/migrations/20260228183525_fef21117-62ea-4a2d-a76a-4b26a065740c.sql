
-- Fix the damaged_quantity that was stored as 1 (whole box) instead of 0.01 (1 piece)
UPDATE public.warehouse_stock 
SET damaged_quantity = 0.01
WHERE product_id = 'c51e3eda-047f-43f3-a9aa-caf367440fc2' 
AND branch_id = '9ba3c0af-f12f-4c0f-8a3c-7b9d3e3988c6';

-- Fix the loading_session_items quantity for exchange sessions
UPDATE public.loading_session_items 
SET quantity = 0.01, notes = 'استبدال تالف: 0.01'
WHERE id = '4b3488fc-14b7-4c4d-acff-e962ae219061';

-- Add 'exchange' to stock_movements movement_type check constraint
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
CHECK (movement_type = ANY (ARRAY['receipt','load','delivery','return_to_worker','return_to_warehouse','adjustment','exchange']));

-- Now insert the missing stock_movement record
INSERT INTO public.stock_movements (product_id, branch_id, quantity, movement_type, status, created_by, worker_id, notes)
SELECT 
  'c51e3eda-047f-43f3-a9aa-caf367440fc2',
  '9ba3c0af-f12f-4c0f-8a3c-7b9d3e3988c6',
  0.01,
  'exchange',
  'approved',
  ls.manager_id,
  ls.worker_id,
  'استبدال تالف - Aroma 250gr fdx'
FROM public.loading_sessions ls
WHERE ls.id = '0b49e555-c4ef-49e3-ab21-03978610e9bf';
