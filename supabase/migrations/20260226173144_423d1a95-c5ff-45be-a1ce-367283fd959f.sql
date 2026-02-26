
-- Create delivery routes table
CREATE TABLE public.delivery_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  branch_id uuid REFERENCES public.branches(id),
  created_by uuid REFERENCES public.workers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create delivery route sectors (ordered sectors in a route)
CREATE TABLE public.delivery_route_sectors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_sectors ENABLE ROW LEVEL SECURITY;

-- RLS policies for delivery_routes
CREATE POLICY "Admins can manage delivery_routes" ON public.delivery_routes FOR ALL USING (is_admin() OR is_branch_admin());
CREATE POLICY "Workers can view delivery_routes" ON public.delivery_routes FOR SELECT USING (is_worker());

-- RLS policies for delivery_route_sectors
CREATE POLICY "Admins can manage delivery_route_sectors" ON public.delivery_route_sectors FOR ALL USING (is_admin() OR is_branch_admin());
CREATE POLICY "Workers can view delivery_route_sectors" ON public.delivery_route_sectors FOR SELECT USING (is_worker());

-- Index for fast lookup
CREATE INDEX idx_delivery_route_sectors_route ON public.delivery_route_sectors(route_id, sort_order);

-- Trigger for updated_at
CREATE TRIGGER update_delivery_routes_updated_at BEFORE UPDATE ON public.delivery_routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
