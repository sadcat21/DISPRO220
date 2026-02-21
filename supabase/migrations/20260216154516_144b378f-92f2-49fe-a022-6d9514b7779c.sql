
-- Delete all data related to Hicham's orders
-- 1. Delete debt payments linked to debts linked to his orders
DELETE FROM public.debt_payments WHERE debt_id IN (
  SELECT id FROM public.customer_debts WHERE order_id IN (
    SELECT id FROM public.orders WHERE assigned_worker_id = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78' OR created_by = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78'
  )
);

-- 2. Delete debt collections linked to debts linked to his orders
DELETE FROM public.debt_collections WHERE debt_id IN (
  SELECT id FROM public.customer_debts WHERE order_id IN (
    SELECT id FROM public.orders WHERE assigned_worker_id = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78' OR created_by = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78'
  )
);

-- 3. Delete customer debts linked to his orders
DELETE FROM public.customer_debts WHERE order_id IN (
  SELECT id FROM public.orders WHERE assigned_worker_id = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78' OR created_by = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78'
);

-- 4. Delete stock movements linked to his orders
DELETE FROM public.stock_movements WHERE order_id IN (
  SELECT id FROM public.orders WHERE assigned_worker_id = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78' OR created_by = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78'
);

-- 5. Delete order items
DELETE FROM public.order_items WHERE order_id IN (
  SELECT id FROM public.orders WHERE assigned_worker_id = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78' OR created_by = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78'
);

-- 6. Delete the orders themselves
DELETE FROM public.orders WHERE assigned_worker_id = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78' OR created_by = 'd1023b86-ed15-42f9-9a0a-3edf2b29dc78';
