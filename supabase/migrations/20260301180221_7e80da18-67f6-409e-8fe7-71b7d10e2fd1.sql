
-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

-- Conversations table
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name text, -- group name (null for direct)
  created_by uuid NOT NULL REFERENCES public.workers(id),
  branch_id uuid REFERENCES public.branches(id),
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Conversation participants
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  last_read_at timestamptz DEFAULT now(),
  is_muted boolean DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, worker_id)
);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conv_participants_worker ON public.conversation_participants(worker_id);
CREATE INDEX idx_conv_participants_conv ON public.conversation_participants(conversation_id);

-- RLS: Workers can see conversations they participate in
CREATE POLICY "Workers can view their conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = id AND cp.worker_id = public.get_worker_id()
  )
);

-- RLS: Any worker can create a conversation
CREATE POLICY "Workers can create conversations"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (public.is_worker());

-- RLS: Participants can update conversation (send messages)
CREATE POLICY "Participants can update conversations"
ON public.conversations FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = id AND cp.worker_id = public.get_worker_id()
  )
);

-- RLS for participants
CREATE POLICY "Workers can view their participations"
ON public.conversation_participants FOR SELECT
TO authenticated
USING (worker_id = public.get_worker_id() OR EXISTS (
  SELECT 1 FROM public.conversation_participants cp2
  WHERE cp2.conversation_id = conversation_id AND cp2.worker_id = public.get_worker_id()
));

CREATE POLICY "Workers can insert participants"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (public.is_worker());

CREATE POLICY "Workers can update their own participation"
ON public.conversation_participants FOR UPDATE
TO authenticated
USING (worker_id = public.get_worker_id());

-- Storage policies for chat-media bucket
CREATE POLICY "Workers can upload chat media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND public.is_worker());

CREATE POLICY "Workers can view chat media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-media' AND public.is_worker());

-- Trigger to update updated_at
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
