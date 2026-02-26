-- Create storage bucket for shared invoices
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-invoices', 'shared-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Workers can upload shared invoices"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'shared-invoices'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to view their own uploads
CREATE POLICY "Workers can view shared invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'shared-invoices'
  AND auth.role() = 'authenticated'
);

-- Allow admins to view all shared invoices
CREATE POLICY "Admins can manage shared invoices"
ON storage.objects FOR ALL
USING (
  bucket_id = 'shared-invoices'
)
WITH CHECK (
  bucket_id = 'shared-invoices'
);