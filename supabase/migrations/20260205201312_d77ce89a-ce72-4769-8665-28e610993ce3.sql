-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can view all customer accounts" ON public.customer_accounts;
DROP POLICY IF EXISTS "Admins can update customer accounts" ON public.customer_accounts;

-- Create new policies that allow public read for workers (since they authenticate via RPC, not Supabase Auth)
-- The app handles authorization at the application level

-- Allow read access for everyone (the app restricts access based on worker role)
CREATE POLICY "Allow read access to customer_accounts"
  ON public.customer_accounts
  FOR SELECT
  USING (true);

-- Allow updates for admins (using app-level auth check)
CREATE POLICY "Allow update customer_accounts"
  ON public.customer_accounts
  FOR UPDATE
  USING (true);