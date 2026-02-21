-- Create RPC to search orders by UUID prefix safely
CREATE OR REPLACE FUNCTION public.search_orders_by_prefix(p_prefix text, p_limit integer DEFAULT 10)
RETURNS TABLE(order_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id as order_id
  FROM public.orders o
  WHERE o.id::text ILIKE (lower(trim(p_prefix)) || '%')
  ORDER BY o.created_at DESC
  LIMIT COALESCE(p_limit, 10);
$$;

-- Restrict function execution to authenticated users (optional hardening)
REVOKE ALL ON FUNCTION public.search_orders_by_prefix(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_orders_by_prefix(text, integer) TO authenticated;