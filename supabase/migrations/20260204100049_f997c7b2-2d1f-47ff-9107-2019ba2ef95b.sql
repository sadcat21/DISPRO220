-- ربط العمال الذين ليس لديهم فرع بفرع مستغانم
UPDATE public.workers 
SET branch_id = '9ba3c0af-f12f-4c0f-8a3c-7b9d3e3988c6' 
WHERE branch_id IS NULL;

-- ربط العملاء الذين ليس لديهم فرع بفرع مستغانم
UPDATE public.customers 
SET branch_id = '9ba3c0af-f12f-4c0f-8a3c-7b9d3e3988c6' 
WHERE branch_id IS NULL;