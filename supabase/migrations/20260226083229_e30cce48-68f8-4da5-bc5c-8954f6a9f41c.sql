
-- Table for tracking coin-to-bills exchange tasks
CREATE TABLE public.coin_exchange_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id),
  manager_id UUID NOT NULL REFERENCES public.workers(id),
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  coin_amount NUMERIC NOT NULL DEFAULT 0,
  returned_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC GENERATED ALWAYS AS (coin_amount - returned_amount) STORED,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Table for partial bill returns
CREATE TABLE public.coin_exchange_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.coin_exchange_tasks(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  received_by UUID NOT NULL REFERENCES public.workers(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coin_exchange_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_exchange_returns ENABLE ROW LEVEL SECURITY;

-- RLS for coin_exchange_tasks
CREATE POLICY "Admins can manage coin_exchange_tasks"
ON public.coin_exchange_tasks FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view their own coin tasks"
ON public.coin_exchange_tasks FOR SELECT
USING (worker_id = get_worker_id());

-- RLS for coin_exchange_returns
CREATE POLICY "Admins can manage coin_exchange_returns"
ON public.coin_exchange_returns FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view their own returns"
ON public.coin_exchange_returns FOR SELECT
USING (EXISTS (
  SELECT 1 FROM coin_exchange_tasks t
  WHERE t.id = coin_exchange_returns.task_id
  AND t.worker_id = get_worker_id()
));

-- Trigger for updated_at
CREATE TRIGGER update_coin_exchange_tasks_updated_at
BEFORE UPDATE ON public.coin_exchange_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
