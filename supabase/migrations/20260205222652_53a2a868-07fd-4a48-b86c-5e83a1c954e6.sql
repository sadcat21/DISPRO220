-- Create RLS policies for product_offers table
ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

-- Policy for reading offers (all authenticated workers can read)
CREATE POLICY "Workers can view all product offers"
ON public.product_offers
FOR SELECT
USING (true);

-- Policy for creating offers (admins and branch admins only)
CREATE POLICY "Admins can create product offers"
ON public.product_offers
FOR INSERT
WITH CHECK (
  public.is_admin() OR public.is_branch_admin()
);

-- Policy for updating offers (admins and branch admins only)
CREATE POLICY "Admins can update product offers"
ON public.product_offers
FOR UPDATE
USING (public.is_admin() OR public.is_branch_admin());

-- Policy for deleting offers (admins only)
CREATE POLICY "Admins can delete product offers"
ON public.product_offers
FOR DELETE
USING (public.is_admin() OR public.is_branch_admin());