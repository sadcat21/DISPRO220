-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Workers can view active products" ON public.products;

-- Create a proper SELECT policy that allows:
-- Admins to see ALL products
-- Workers to see only active products
CREATE POLICY "Users can view products based on role" 
ON public.products 
FOR SELECT 
USING (
  is_admin() OR (is_worker() AND is_active = true)
);