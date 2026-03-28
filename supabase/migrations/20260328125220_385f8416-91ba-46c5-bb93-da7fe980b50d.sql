
-- Create the start_loading_session_atomic function
-- This function creates a loading session and returns the session data
CREATE OR REPLACE FUNCTION public.start_loading_session_atomic(
  p_worker_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_manager_id uuid;
  v_branch_id uuid;
  v_session_id uuid;
  v_session jsonb;
BEGIN
  -- Get current worker (manager) from session
  v_manager_id := public.get_worker_id();
  IF v_manager_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no active session';
  END IF;

  -- Get worker's branch
  SELECT branch_id INTO v_branch_id
  FROM public.workers
  WHERE id = p_worker_id AND is_active = true;

  IF v_branch_id IS NULL THEN
    -- fallback: use manager's branch
    SELECT branch_id INTO v_branch_id
    FROM public.workers
    WHERE id = v_manager_id;
  END IF;

  -- Create the loading session
  INSERT INTO public.loading_sessions (worker_id, manager_id, branch_id, status, notes)
  VALUES (p_worker_id, v_manager_id, v_branch_id, 'open', p_notes)
  RETURNING id INTO v_session_id;

  -- Build session JSON to return
  v_session := jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session_id,
      'worker_id', p_worker_id,
      'manager_id', v_manager_id,
      'branch_id', v_branch_id,
      'status', 'open',
      'notes', p_notes,
      'created_at', now()
    )
  );

  RETURN v_session;
END;
$$;
