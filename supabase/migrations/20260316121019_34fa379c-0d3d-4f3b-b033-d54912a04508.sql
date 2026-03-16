CREATE OR REPLACE FUNCTION public.get_customer_sales_rep_statuses(
  p_worker_ids uuid[],
  p_customer_ids uuid[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(customer_id uuid, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (public.is_admin() OR public.is_worker() OR public.get_user_role() = 'supervisor'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF COALESCE(array_length(p_worker_ids, 1), 0) = 0
     OR COALESCE(array_length(p_customer_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT unnest(p_customer_ids) AS customer_id
  ),
  latest_visits AS (
    SELECT DISTINCT ON (v.customer_id)
      v.customer_id,
      COALESCE(v.notes, '') AS notes
    FROM public.visit_tracking v
    WHERE v.customer_id = ANY(p_customer_ids)
      AND v.worker_id = ANY(p_worker_ids)
      AND v.operation_type = 'visit'
      AND v.created_at >= p_start
      AND v.created_at <= p_end
    ORDER BY v.customer_id, v.created_at DESC
  ),
  ordered_customers AS (
    SELECT DISTINCT o.customer_id
    FROM public.orders o
    WHERE o.customer_id = ANY(p_customer_ids)
      AND o.created_by = ANY(p_worker_ids)
      AND o.created_at >= p_start
      AND o.created_at <= p_end
      AND o.status <> 'cancelled'
  )
  SELECT
    b.customer_id,
    CASE
      WHEN oc.customer_id IS NOT NULL THEN 'ordered'
      WHEN lv.customer_id IS NULL THEN 'not_visited'
      WHEN lv.notes ILIKE '%مغلق%' THEN 'closed'
      WHEN lv.notes ILIKE '%غير متاح%' THEN 'unavailable'
      ELSE 'visited'
    END AS status
  FROM base b
  LEFT JOIN latest_visits lv ON lv.customer_id = b.customer_id
  LEFT JOIN ordered_customers oc ON oc.customer_id = b.customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_sales_rep_statuses(uuid[], uuid[], timestamptz, timestamptz)
TO authenticated;