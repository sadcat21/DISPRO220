-- Drop old restrictive policy
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

-- Create new policies that include branch_admin
CREATE POLICY "Admins and branch admins can update products" 
ON public.products FOR UPDATE 
USING (is_admin() OR EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'branch_admin'
));

CREATE POLICY "Admins and branch admins can insert products" 
ON public.products FOR INSERT 
WITH CHECK (is_admin() OR EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'branch_admin'
));

CREATE POLICY "Admins and branch admins can delete products" 
ON public.products FOR DELETE 
USING (is_admin() OR EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'branch_admin'
));