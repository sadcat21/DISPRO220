CREATE OR REPLACE FUNCTION public.log_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_worker_id uuid;
BEGIN
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

  -- Log payment type change (with_invoice / without_invoice)
  IF OLD.payment_type IS DISTINCT FROM NEW.payment_type THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, details)
    VALUES (NEW.id, 'payment_updated', OLD.payment_type, NEW.payment_type, v_worker_id,
      jsonb_build_object(
        'old_payment_type', OLD.payment_type,
        'new_payment_type', NEW.payment_type,
        'payment_type_change', true
      ));
  END IF;

  -- Log invoice_payment_method change (e.g., gros, retail, super_gros)
  IF OLD.invoice_payment_method IS DISTINCT FROM NEW.invoice_payment_method THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, details)
    VALUES (NEW.id, 'payment_updated', OLD.invoice_payment_method, NEW.invoice_payment_method, v_worker_id,
      jsonb_build_object(
        'old_invoice_method', OLD.invoice_payment_method,
        'new_invoice_method', NEW.invoice_payment_method,
        'invoice_method_change', true
      ));
  END IF;

  -- Log amount change with payment context
  IF OLD.total_amount IS DISTINCT FROM NEW.total_amount THEN
    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, performed_by, details)
    VALUES (NEW.id, 'amount_changed', OLD.total_amount::text, NEW.total_amount::text, v_worker_id,
      jsonb_build_object(
        'old_amount', OLD.total_amount,
        'new_amount', NEW.total_amount,
        'payment_type', NEW.payment_type,
        'invoice_payment_method', NEW.invoice_payment_method
      ));
  END IF;

  RETURN NEW;
END;
$function$