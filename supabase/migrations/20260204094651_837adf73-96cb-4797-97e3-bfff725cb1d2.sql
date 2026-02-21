-- Create worker_roles table to support multiple roles per worker
CREATE TABLE public.worker_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (worker_id, role, branch_id)
);

-- Enable RLS
ALTER TABLE public.worker_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow read access to worker_roles"
ON public.worker_roles
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage worker_roles"
ON public.worker_roles
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Migrate existing roles from workers table to worker_roles
INSERT INTO public.worker_roles (worker_id, role, branch_id)
SELECT id, role, branch_id FROM public.workers;

-- Create function to get worker roles
CREATE OR REPLACE FUNCTION public.get_worker_roles(p_worker_id uuid)
RETURNS TABLE(role app_role, branch_id uuid, branch_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wr.role, wr.branch_id, b.name as branch_name
    FROM public.worker_roles wr
    LEFT JOIN public.branches b ON b.id = wr.branch_id
    WHERE wr.worker_id = p_worker_id
$$;