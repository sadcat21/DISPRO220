-- Create a new table for customer approval requests
CREATE TABLE IF NOT EXISTS public.customer_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type TEXT NOT NULL CHECK (operation_type IN ('insert', 'update', 'delete')),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    requested_by UUID NOT NULL REFERENCES public.workers(id),
    branch_id UUID REFERENCES public.branches(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.workers(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_approval_requests ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is branch admin of a specific branch
CREATE OR REPLACE FUNCTION public.is_branch_admin_of(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.branches 
        WHERE id = p_branch_id AND admin_id = public.get_worker_id()
    )
$$;

-- RLS Policies
-- 1. Workers can view their own requests
CREATE POLICY "Workers can view own requests" ON public.customer_approval_requests
FOR SELECT USING (requested_by = public.get_worker_id());

-- 2. admins can view all requests
CREATE POLICY "Admins can view all requests" ON public.customer_approval_requests
FOR SELECT USING (public.is_admin());

-- 3. Branch admins can view requests from their branch
CREATE POLICY "Branch admins can view branch requests" ON public.customer_approval_requests
FOR SELECT USING (
    (get_user_role() = 'branch_admin' AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id())) OR
    (get_user_role() = 'supervisor' AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

-- 4. Workers can insert requests
CREATE POLICY "Workers can insert requests" ON public.customer_approval_requests
FOR INSERT WITH CHECK (
    requested_by = public.get_worker_id()
);

-- 5. Admins and branch admins can update requests (to approve/reject)
CREATE POLICY "Admins/Managers can update requests" ON public.customer_approval_requests
FOR UPDATE USING (
    public.is_admin() OR 
    (get_user_role() = 'branch_admin' AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
);

-- Trigger for updated_at
CREATE TRIGGER update_customer_approval_requests_updated_at
BEFORE UPDATE ON public.customer_approval_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for performance
CREATE INDEX idx_customer_approval_requests_status ON public.customer_approval_requests(status);
CREATE INDEX idx_customer_approval_requests_requested_by ON public.customer_approval_requests(requested_by);
CREATE INDEX idx_customer_approval_requests_branch_id ON public.customer_approval_requests(branch_id);
