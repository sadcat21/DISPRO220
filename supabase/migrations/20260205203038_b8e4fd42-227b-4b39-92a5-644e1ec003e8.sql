-- Reset the account that was approved but doesn't have a customer linked
UPDATE customer_accounts 
SET status = 'pending', approved_at = NULL, approved_by = NULL
WHERE id = 'e9c276a1-75b3-40c1-89c0-fb1891879c87' AND customer_id IS NULL;