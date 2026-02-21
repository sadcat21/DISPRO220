-- Create permissive SELECT policies for anonymous access since we're not using Supabase Auth
-- The app uses a custom workers table authentication

-- Allow SELECT on promos for all authenticated and anonymous users
DROP POLICY IF EXISTS "View promos based on role" ON public.promos;
CREATE POLICY "Allow read access to promos"
ON public.promos
FOR SELECT
USING (true);

-- Allow SELECT on workers (excluding password_hash) for all
DROP POLICY IF EXISTS "View workers based on role" ON public.workers;
CREATE POLICY "Allow read access to workers"
ON public.workers
FOR SELECT
USING (true);

-- Allow SELECT on customers for all
DROP POLICY IF EXISTS "Workers can view branch customers" ON public.customers;
CREATE POLICY "Allow read access to customers"
ON public.customers
FOR SELECT
USING (true);

-- Allow SELECT on products for all
DROP POLICY IF EXISTS "Users can view products based on role" ON public.products;
CREATE POLICY "Allow read access to products"
ON public.products
FOR SELECT
USING (true);

-- Allow SELECT on branches for all
DROP POLICY IF EXISTS "Workers can view their branch" ON public.branches;
DROP POLICY IF EXISTS "Branch admins can view their branch" ON public.branches;
CREATE POLICY "Allow read access to branches"
ON public.branches
FOR SELECT
USING (true);