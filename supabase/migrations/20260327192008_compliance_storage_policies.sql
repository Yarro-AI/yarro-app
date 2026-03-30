-- Create compliance-documents storage bucket (if not already created via dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('compliance-documents', 'compliance-documents', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload documents
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'compliance-documents');

-- Allow authenticated users to view documents
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'compliance-documents');

-- Allow authenticated users to delete their documents
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'compliance-documents');
