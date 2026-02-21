-- Update search function to also search by partial UUID match
CREATE OR REPLACE FUNCTION public.search_orders_by_prefix(
  p_prefix text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_prefix text;
BEGIN
  clean_prefix := lower(trim(p_prefix));
  
  -- If empty, return nothing
  IF clean_prefix = '' OR length(clean_prefix) < 2 THEN
    RETURN;
  END IF;
  
  -- Check if it looks like a UUID or UUID fragment (hex characters and dashes)
  IF clean_prefix ~ '^[0-9a-f-]+$' THEN
    -- First try: Search by order ID prefix (fast exact match from start)
    RETURN QUERY
    SELECT o.id
    FROM public.orders o
    WHERE o.id::text LIKE (clean_prefix || '%')
    ORDER BY o.created_at DESC
    LIMIT p_limit;
    
    -- If found results, return them
    IF FOUND THEN
      RETURN;
    END IF;
    
    -- Second try: Search by partial UUID match (contains) - useful for corrupted scans
    RETURN QUERY
    SELECT o.id
    FROM public.orders o
    WHERE o.id::text LIKE ('%' || clean_prefix || '%')
    ORDER BY o.created_at DESC
    LIMIT p_limit;
    
    -- If found results, return them
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;
  
  -- Otherwise search by customer name or phone
  RETURN QUERY
  SELECT DISTINCT o.id
  FROM public.orders o
  INNER JOIN public.customers c ON c.id = o.customer_id
  WHERE c.name ILIKE ('%' || clean_prefix || '%')
     OR c.phone ILIKE ('%' || clean_prefix || '%')
  ORDER BY o.id
  LIMIT p_limit;
END;
$$;