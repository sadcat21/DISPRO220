-- Update all customers in wilaya مستغانم to be linked to فرع مستغانم
UPDATE customers 
SET branch_id = '9ba3c0af-f12f-4c0f-8a3c-7b9d3e3988c6' 
WHERE wilaya = 'مستغانم' 
AND status = 'active' 
AND (branch_id IS NULL OR branch_id != '9ba3c0af-f12f-4c0f-8a3c-7b9d3e3988c6');