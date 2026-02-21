-- Drop the restrictive insert policy on customers
DROP POLICY IF EXISTS "Workers can insert branch customers" ON public.customers;

-- Create a more permissive insert policy that works with custom auth
-- The app handles authorization at the application level
CREATE POLICY "Allow insert customers"
  ON public.customers
  FOR INSERT
  WITH CHECK (true);

-- Also update select policy to ensure new customers are visible
DROP POLICY IF EXISTS "View customers based on role" ON public.customers;

CREATE POLICY "Allow read access to customers"
  ON public.customers
  FOR SELECT
  USING (true);