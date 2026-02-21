-- Add indexes to speed up order search
CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON public.customers (lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);

-- Enable pg_trgm extension for faster text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for faster ILIKE searches
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm ON public.customers USING gin (phone gin_trgm_ops);

-- Optimize the search function with better logic
CREATE OR REPLACE FUNCTION public.search_orders_by_prefix(p_prefix text, p_limit integer DEFAULT 10)
RETURNS TABLE(order_id uuid)
LANGUAGE plpgsql
STABLE
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
  
  -- Check if it looks like a UUID prefix (hex characters only)
  IF clean_prefix ~ '^[0-9a-f]+$' THEN
    -- Search by order ID prefix first (fast exact match)
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