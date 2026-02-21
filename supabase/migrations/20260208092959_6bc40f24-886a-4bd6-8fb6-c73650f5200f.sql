
-- Create priority enum
DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create task status enum
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('todo', 'doing', 'done');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'todo',
  due_date DATE,
  assigned_to UUID REFERENCES public.workers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_branch_id ON public.tasks(branch_id);

-- RLS Policies

-- SELECT: workers see tasks assigned to them OR created by them OR general tasks (assigned_to IS NULL) in their branch
-- Admins see all
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
  public.is_admin()
  OR assigned_to = public.get_worker_id()
  OR created_by = public.get_worker_id()
  OR (assigned_to IS NULL AND (branch_id IS NULL OR branch_id = public.get_worker_branch_id()))
);

-- INSERT: admin, branch_admin, supervisor can create tasks for anyone; workers can create for themselves only
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
  public.get_user_role() IN ('admin', 'branch_admin', 'supervisor')
  OR (public.get_user_role() = 'worker' AND created_by = public.get_worker_id() AND (assigned_to IS NULL OR assigned_to = public.get_worker_id()))
);

-- UPDATE: creator or assignee can update
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  public.is_admin()
  OR assigned_to = public.get_worker_id()
  OR created_by = public.get_worker_id()
);

-- DELETE: only creator or admin
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
  public.is_admin()
  OR created_by = public.get_worker_id()
);

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
