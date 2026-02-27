
-- جدول جلسات الشحن
CREATE TABLE public.loading_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  manager_id UUID NOT NULL REFERENCES public.workers(id),
  branch_id UUID REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'open', -- open, completed
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- عناصر جلسة الشحن
CREATE TABLE public.loading_session_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.loading_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  gift_quantity NUMERIC NOT NULL DEFAULT 0,
  gift_unit TEXT DEFAULT 'piece',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_session_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for loading_sessions
CREATE POLICY "Admins can manage loading_sessions"
ON public.loading_sessions FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view their own loading sessions"
ON public.loading_sessions FOR SELECT
USING (worker_id = get_worker_id());

-- RLS policies for loading_session_items
CREATE POLICY "Admins can manage loading_session_items"
ON public.loading_session_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.loading_sessions s
  WHERE s.id = loading_session_items.session_id
  AND (is_admin() OR is_branch_admin())
));

CREATE POLICY "Workers can view their session items"
ON public.loading_session_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.loading_sessions s
  WHERE s.id = loading_session_items.session_id
  AND s.worker_id = get_worker_id()
));

-- Index for performance
CREATE INDEX idx_loading_sessions_worker ON public.loading_sessions(worker_id);
CREATE INDEX idx_loading_sessions_branch ON public.loading_sessions(branch_id);
CREATE INDEX idx_loading_session_items_session ON public.loading_session_items(session_id);
