-- Add file-related columns to board_objects
ALTER TABLE board_objects ADD COLUMN storage_path TEXT;
ALTER TABLE board_objects ADD COLUMN file_name TEXT;
ALTER TABLE board_objects ADD COLUMN mime_type TEXT;
ALTER TABLE board_objects ADD COLUMN file_size BIGINT;

-- Create storage bucket for board file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'board-assets',
  'board-assets',
  false,
  52428800,
  ARRAY[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'text/plain', 'text/markdown', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: board members can read files from their boards
CREATE POLICY "Board members can read files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'board-assets'
  AND auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = (storage.foldername(name))[1]::uuid
  )
);

-- RLS: board editors can upload files
CREATE POLICY "Board editors can upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'board-assets'
  AND auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = (storage.foldername(name))[1]::uuid
    AND role IN ('owner', 'editor')
  )
);

-- RLS: board editors can delete files
CREATE POLICY "Board editors can delete files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'board-assets'
  AND auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = (storage.foldername(name))[1]::uuid
    AND role IN ('owner', 'editor')
  )
);
