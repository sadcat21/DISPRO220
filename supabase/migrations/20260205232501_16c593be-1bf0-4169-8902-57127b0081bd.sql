-- Fix RLS policy for product_offer_tiers to use get_worker_id() correctly
DROP POLICY IF EXISTS "Allow insert for admins and branch admins" ON public.product_offer_tiers;
DROP POLICY IF EXISTS "Allow delete for admins and branch admins" ON public.product_offer_tiers;
DROP POLICY IF EXISTS "Allow update for admins and branch admins" ON public.product_offer_tiers;

-- Create new policies that check if user is admin or branch_admin
CREATE POLICY "Allow insert for admins and branch admins" 
ON public.product_offer_tiers 
FOR INSERT 
WITH CHECK (is_admin() OR is_branch_admin());

CREATE POLICY "Allow delete for admins and branch admins" 
ON public.product_offer_tiers 
FOR DELETE 
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Allow update for admins and branch admins" 
ON public.product_offer_tiers 
FOR UPDATE 
USING (is_admin() OR is_branch_admin());