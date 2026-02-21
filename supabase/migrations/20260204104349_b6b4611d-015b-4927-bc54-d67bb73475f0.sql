-- Create activity logs table
CREATE TABLE public.activity_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_id UUID NOT NULL REFERENCES public.workers(id),
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    branch_id UUID REFERENCES public.branches(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for activity_logs
CREATE POLICY "View activity logs based on role" ON public.activity_logs
FOR SELECT USING (
    is_admin() OR
    (get_user_role() = 'supervisor') OR
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id())) OR
    (worker_id = get_worker_id())
);

CREATE POLICY "Workers can insert their own logs" ON public.activity_logs
FOR INSERT WITH CHECK (
    worker_id = get_worker_id() OR is_admin()
);

-- Add index for better query performance
CREATE INDEX idx_activity_logs_worker_id ON public.activity_logs(worker_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX idx_activity_logs_entity_type ON public.activity_logs(entity_type);

-- Update RLS policies for promos to allow workers to edit/delete their own
CREATE POLICY "Workers can update their own promos" ON public.promos
FOR UPDATE USING (
    is_admin() OR
    (is_worker() AND worker_id = get_worker_id())
);

CREATE POLICY "Workers can delete their own promos" ON public.promos
FOR DELETE USING (
    is_admin() OR
    (is_worker() AND worker_id = get_worker_id())
);

-- Add new permission for activity logs
INSERT INTO public.permissions (code, name_ar, description_ar, category, resource) VALUES
('view_activity_logs', 'عرض سجل الأحداث', 'عرض سجل نشاطات المستخدمين', 'page_access', 'activity_logs'),
('view_all_activity_logs', 'عرض جميع سجلات الأحداث', 'عرض سجل نشاطات جميع المستخدمين', 'data_scope', 'activity_logs');

-- Add permission to supervisor role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT cr.id, p.id FROM public.custom_roles cr, public.permissions p
WHERE cr.code = 'supervisor' AND p.code IN ('view_activity_logs', 'view_all_activity_logs')
ON CONFLICT DO NOTHING;