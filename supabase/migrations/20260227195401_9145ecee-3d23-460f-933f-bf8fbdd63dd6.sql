
-- Add image_url column to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload product images
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Allow public read access to product images
CREATE POLICY "Public read access for product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated users to update/delete product images
CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
