-- Drop existing policy and create new one that allows both admin and branch_admin
DROP POLICY IF EXISTS "Admins can manage stamp_price_tiers" ON public.stamp_price_tiers;

CREATE POLICY "Admins and branch admins can manage stamp_price_tiers" 
ON public.stamp_price_tiers 
FOR ALL 
USING (is_admin() OR is_branch_admin())
WITH CHECK (is_admin() OR is_branch_admin());