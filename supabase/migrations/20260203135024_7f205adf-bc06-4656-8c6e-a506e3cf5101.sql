-- Add branch_admin role to the enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'branch_admin';

-- Update promos foreign key to handle customer deletion
-- First drop the existing constraint
ALTER TABLE public.promos DROP CONSTRAINT IF EXISTS promos_customer_id_fkey;

-- Re-add with ON DELETE CASCADE (promos will be deleted when customer is deleted)
-- Or use RESTRICT to prevent deletion if promos exist
ALTER TABLE public.promos 
ADD CONSTRAINT promos_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

-- Update RLS policies for branch_admin role
-- Workers table: branch_admin can view workers in their branch
DROP POLICY IF EXISTS "Allow read access to workers" ON public.workers;
CREATE POLICY "View workers based on role"
ON public.workers
FOR SELECT
USING (
  -- Admin sees all
  (SELECT role FROM public.workers WHERE id = (
    SELECT worker_id FROM public.user_roles WHERE user_id = auth.uid()
  )) = 'admin'
  OR
  -- Branch admin sees workers in their branch
  (
    id IN (
      SELECT w.id FROM public.workers w
      WHERE w.branch_id IN (
        SELECT b.id FROM public.branches b WHERE b.admin_id = (
          SELECT worker_id FROM public.user_roles WHERE user_id = auth.uid()
        )
      )
    )
  )
  OR
  -- Workers can see themselves
  id = (SELECT worker_id FROM public.user_roles WHERE user_id = auth.uid())
  OR
  -- Allow anonymous read for login (since we don't use Supabase Auth)
  auth.uid() IS NULL
);