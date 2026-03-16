REVOKE ALL ON FUNCTION public.get_customer_sales_rep_statuses(uuid[], uuid[], timestamptz, timestamptz)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_customer_sales_rep_statuses(uuid[], uuid[], timestamptz, timestamptz)
TO authenticated;