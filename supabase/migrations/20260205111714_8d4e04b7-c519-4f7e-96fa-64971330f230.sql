-- Update RPC to search orders by UUID prefix OR customer name/phone
CREATE OR REPLACE FUNCTION public.search_orders_by_prefix(p_prefix text, p_limit integer DEFAULT 10)
RETURNS TABLE(order_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT o.id as order_id
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id
  WHERE 
    -- Search by order ID prefix
    o.id::text ILIKE (lower(trim(p_prefix)) || '%')
    -- OR search by customer name
    OR c.name ILIKE ('%' || trim(p_prefix) || '%')
    -- OR search by customer phone
    OR c.phone ILIKE ('%' || trim(p_prefix) || '%')
  ORDER BY o.id
  LIMIT COALESCE(p_limit, 10);
$$;