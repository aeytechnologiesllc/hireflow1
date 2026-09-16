-- Storage bucket limits (2026-09-16).
--
-- No bucket had a file size limit or a file type list. The one that matters
-- most is `avatars`: it is PUBLIC, and any signed-up account could upload any
-- file type, at any size, into its own folder and get a permanent public URL on
-- our storage domain (including SVG, which can carry script). The private
-- buckets are only readable by the right people, but still had no size cap.
--
-- Limits sit above what each upload screen already enforces, so no real upload
-- changes behavior:
--   avatars (profile photo, company logo)   app: image/*, 5 MB   -> images only (no SVG), 5 MB
--   resumes, requested-documents, portfolios app: 10 MB           -> 15 MB
--   documents (plus server-built signed PDFs) app: 10 MB          -> 25 MB
--   message-attachments (no picker in the UI today)               -> 25 MB
-- Left alone on purpose: videos, voice-interview-recordings and interviews hold
-- recordings whose size depends on interview length; a cap there could cut a
-- real candidate's interview off.

UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY[
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'image/heic', 'image/heif', 'image/avif'
    ]
WHERE id = 'avatars';

UPDATE storage.buckets SET file_size_limit = 15 * 1024 * 1024
WHERE id IN ('resumes', 'requested-documents', 'portfolios');

UPDATE storage.buckets SET file_size_limit = 25 * 1024 * 1024
WHERE id IN ('documents', 'message-attachments');
