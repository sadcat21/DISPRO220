
-- Add DELETE policy for admins on customer_accounts
CREATE POLICY "Admins can delete customer_accounts"
ON public.customer_accounts
FOR DELETE
USING (is_admin() OR is_branch_admin());
