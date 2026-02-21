-- Adjust product_offer_tiers RLS to match existing custom auth role logic
DROP POLICY IF EXISTS "Allow insert for admins and branch admins" ON public.product_offer_tiers;
DROP POLICY IF EXISTS "Allow delete for admins and branch admins" ON public.product_offer_tiers;
DROP POLICY IF EXISTS "Allow update for admins and branch admins" ON public.product_offer_tiers;

CREATE POLICY "Allow insert for admins and branch admins"
ON public.product_offer_tiers
FOR INSERT
WITH CHECK (can_manage_product_offers(get_worker_id()));

CREATE POLICY "Allow delete for admins and branch admins"
ON public.product_offer_tiers
FOR DELETE
USING (can_manage_product_offers(get_worker_id()));

CREATE POLICY "Allow update for admins and branch admins"
ON public.product_offer_tiers
FOR UPDATE
USING (can_manage_product_offers(get_worker_id()));
