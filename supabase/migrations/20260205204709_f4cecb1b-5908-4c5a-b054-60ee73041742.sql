-- Fix stamp_price_tiers management policy: treat branch_admin as a role in user_roles

DROP POLICY IF EXISTS "Admins and branch admins can manage stamp_price_tiers" ON public.stamp_price_tiers;

CREATE POLICY "Admins and branch admins can manage stamp_price_tiers"
ON public.stamp_price_tiers
FOR ALL
USING (
  public.is_admin()
  OR public.get_user_role() = 'branch_admin'
)
WITH CHECK (
  public.is_admin()
  OR public.get_user_role() = 'branch_admin'
);
