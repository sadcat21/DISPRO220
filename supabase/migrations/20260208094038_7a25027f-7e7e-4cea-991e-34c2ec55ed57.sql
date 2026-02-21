-- Add task_type enum
CREATE TYPE public.task_type AS ENUM ('task', 'request');

-- Add type column to tasks table
ALTER TABLE public.tasks ADD COLUMN type public.task_type NOT NULL DEFAULT 'task';

-- Add index for type filtering
CREATE INDEX idx_tasks_type ON public.tasks(type);