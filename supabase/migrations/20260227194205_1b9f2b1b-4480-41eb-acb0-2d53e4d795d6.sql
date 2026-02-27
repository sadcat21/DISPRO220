-- Drop the restrictive worker update policy
DROP POLICY IF EXISTS "Workers can update their own debts" ON public.customer_debts;

-- Create a broader policy: any worker can update debts (needed for cross-worker debt collection)
CREATE POLICY "Workers can update debts"
ON public.customer_debts
FOR UPDATE
USING (is_worker())
WITH CHECK (is_worker());