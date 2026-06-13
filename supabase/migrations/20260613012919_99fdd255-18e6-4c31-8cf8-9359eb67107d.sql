ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS banner_path text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS share_image_url text;

CREATE POLICY "Authenticated users can view quiz banners"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'quiz-banners');

CREATE POLICY "Admins can upload quiz banners"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quiz-banners'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update quiz banners"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'quiz-banners'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'quiz-banners'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete quiz banners"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'quiz-banners'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);