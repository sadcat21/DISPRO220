
UPDATE storage.buckets SET public = true WHERE id = 'chat-media';

-- Ensure public read access
CREATE POLICY "Chat media publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');
