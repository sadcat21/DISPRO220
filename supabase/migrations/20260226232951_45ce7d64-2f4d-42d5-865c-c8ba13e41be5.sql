-- Allow workers to insert zones from customer forms
CREATE POLICY "Workers can insert sector_zones"
ON public.sector_zones
FOR INSERT
WITH CHECK (is_worker());