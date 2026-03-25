
-- Table to log all order events for comprehensive tracking
CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- status_change, item_modified, payment_updated, worker_changed, printed, created, price_changed
  old_value text,
  new_value text,
  details jsonb,
  performed_by uuid REFERENCES public.workers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX idx_order_events_created_at ON public.order_events(created_at DESC);
CREATE INDEX idx_order_events_event_type ON public.order_events(event_type);

-- Enable RLS
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Workers can view events
CREATE POLICY "Workers can view order events"
  ON public.order_events FOR SELECT
  TO authenticated
  USING (public.is_worker());

-- Workers can insert events
CREATE POLICY "Workers can insert order events"
  ON public.order_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_worker());

-- Auto-log status changes via trigger
CREATE OR REPLACE FUNCTION public.log_order_status_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_worker_id uuid;
BEGIN
  -- Get current worker
  v_worker_id := public.get_worker_id();

  -- Log status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, v_worker_id);
  END IF;

  -- Log worker assignment change
  IF OLD.assigned_worker_id IS DISTINCT FROM NEW.assigned_worker_id THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, details)
    VALUES (NEW.id, 'worker_changed', OLD.assigned_worker_id::text, NEW.assigned_worker_id::text, v_worker_id,
      jsonb_build_object('old_worker', OLD.assigned_worker_id, 'new_worker', NEW.assigned_worker_id));
  END IF;

  -- Log payment type change
  IF OLD.payment_type IS DISTINCT FROM NEW.payment_type THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by)
    VALUES (NEW.id, 'payment_updated', OLD.payment_type, NEW.payment_type, v_worker_id);
  END IF;

  -- Log amount change
  IF OLD.total_amount IS DISTINCT FROM NEW.total_amount THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, details)
    VALUES (NEW.id, 'amount_changed', OLD.total_amount::text, NEW.total_amount::text, v_worker_id,
      jsonb_build_object('old_amount', OLD.total_amount, 'new_amount', NEW.total_amount));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_status_change();

-- Auto-log order creation
CREATE OR REPLACE FUNCTION public.log_order_creation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.order_events (order_id, event_type, new_value, performed_by, details)
  VALUES (NEW.id, 'created', NEW.status, NEW.created_by,
    jsonb_build_object('customer_id', NEW.customer_id, 'total_amount', NEW.total_amount));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_order_creation
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_creation();
