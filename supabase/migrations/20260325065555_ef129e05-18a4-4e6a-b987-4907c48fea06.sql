
-- Backfill order_events from existing orders
INSERT INTO public.order_events (order_id, event_type, new_value, performed_by, created_at, details)
SELECT 
  o.id,
  'created',
  o.status,
  o.created_by,
  o.created_at,
  jsonb_build_object('customer_id', o.customer_id, 'total_amount', o.total_amount)
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_events oe WHERE oe.order_id = o.id AND oe.event_type = 'created'
);

-- Backfill status changes for delivered orders
INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, created_at)
SELECT 
  o.id,
  'status_change',
  'assigned',
  'delivered',
  COALESCE(o.assigned_worker_id, o.created_by),
  COALESCE(o.updated_at, o.created_at)
FROM public.orders o
WHERE o.status = 'delivered'
AND NOT EXISTS (
  SELECT 1 FROM public.order_events oe WHERE oe.order_id = o.id AND oe.event_type = 'status_change' AND oe.new_value = 'delivered'
);

-- Backfill status changes for cancelled orders
INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, created_at)
SELECT 
  o.id,
  'status_change',
  'assigned',
  'cancelled',
  COALESCE(o.assigned_worker_id, o.created_by),
  COALESCE(o.updated_at, o.created_at)
FROM public.orders o
WHERE o.status = 'cancelled'
AND NOT EXISTS (
  SELECT 1 FROM public.order_events oe WHERE oe.order_id = o.id AND oe.event_type = 'status_change' AND oe.new_value = 'cancelled'
);

-- Backfill worker assignment events
INSERT INTO public.order_events (order_id, event_type, new_value, performed_by, created_at)
SELECT 
  o.id,
  'worker_changed',
  o.assigned_worker_id::text,
  o.created_by,
  o.created_at
FROM public.orders o
WHERE o.assigned_worker_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.order_events oe WHERE oe.order_id = o.id AND oe.event_type = 'worker_changed'
);
