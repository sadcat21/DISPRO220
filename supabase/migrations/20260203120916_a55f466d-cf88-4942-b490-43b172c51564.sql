-- Create branches table
CREATE TABLE public.branches (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    wilaya TEXT NOT NULL,
    address TEXT,
    admin_id UUID REFERENCES public.workers(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Add branch_id to workers
ALTER TABLE public.workers ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to customers  
ALTER TABLE public.customers ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Update workers default is_active to true (already true, but ensure edge function uses it)
ALTER TABLE public.workers ALTER COLUMN is_active SET DEFAULT true;

-- Create function to get worker's branch_id
CREATE OR REPLACE FUNCTION public.get_worker_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT branch_id FROM public.workers WHERE id = get_worker_id()
$$;

-- Check if user is branch admin
CREATE OR REPLACE FUNCTION public.is_branch_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.branches 
        WHERE admin_id = get_worker_id() AND is_active = true
    )
$$;

-- Check if user is branch admin of specific branch
CREATE OR REPLACE FUNCTION public.is_admin_of_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.branches 
        WHERE id = p_branch_id AND admin_id = get_worker_id() AND is_active = true
    )
$$;

-- RLS for branches
CREATE POLICY "Admins can manage all branches"
ON public.branches FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Branch admins can view their branch"
ON public.branches FOR SELECT
USING (admin_id = get_worker_id() OR is_admin());

CREATE POLICY "Workers can view their branch"
ON public.branches FOR SELECT
USING (id = get_worker_branch_id());

-- Update customers RLS to respect branches
DROP POLICY IF EXISTS "Workers can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Workers can insert customers" ON public.customers;

CREATE POLICY "Workers can view branch customers"
ON public.customers FOR SELECT
USING (
    is_admin() OR 
    (is_worker() AND branch_id = get_worker_branch_id()) OR
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

CREATE POLICY "Workers can insert branch customers"
ON public.customers FOR INSERT
WITH CHECK (
    is_admin() OR 
    (is_worker() AND branch_id = get_worker_branch_id()) OR
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

-- Update workers RLS
DROP POLICY IF EXISTS "Admins can view all workers" ON public.workers;

CREATE POLICY "View workers based on role"
ON public.workers FOR SELECT
USING (
    is_admin() OR 
    id = get_worker_id() OR
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

-- Branch admins can insert workers to their branch
CREATE POLICY "Branch admins can insert workers"
ON public.workers FOR INSERT
WITH CHECK (
    is_admin() OR 
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

-- Branch admins can update workers in their branch
DROP POLICY IF EXISTS "Admins can update workers" ON public.workers;
CREATE POLICY "Update workers based on role"
ON public.workers FOR UPDATE
USING (
    is_admin() OR 
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

-- Update promos RLS to include branch filtering
DROP POLICY IF EXISTS "Workers can view own promos" ON public.promos;

CREATE POLICY "View promos based on role"
ON public.promos FOR SELECT
USING (
    is_admin() OR 
    worker_id = get_worker_id() OR
    (is_branch_admin() AND worker_id IN (
        SELECT id FROM workers WHERE branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id())
    ))
);

-- Add trigger for updated_at on branches
CREATE TRIGGER update_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default branch for Mostaganem (mosta 27)
INSERT INTO public.branches (name, wilaya, address)
VALUES ('فرع مستغانم', 'مستغانم', 'مستغانم - الجزائر');