-- ============ ads: popup placement + frequency + richer scheduling ============
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS frequency_minutes integer NOT NULL DEFAULT 5;

-- ============ storage bucket for ad creatives (public read) ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-creatives', 'ad-creatives', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "ad creatives publicly readable" ON storage.objects;
CREATE POLICY "ad creatives publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'ad-creatives');

DROP POLICY IF EXISTS "admins manage ad creatives" ON storage.objects;
CREATE POLICY "admins manage ad creatives" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'ad-creatives' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'ad-creatives' AND public.is_super_admin(auth.uid()));

-- ============ generic public bucket for admin-managed content images ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-images', 'content-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "content images publicly readable" ON storage.objects;
CREATE POLICY "content images publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-images');

DROP POLICY IF EXISTS "admins manage content images" ON storage.objects;
CREATE POLICY "admins manage content images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'content-images' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'content-images' AND public.is_super_admin(auth.uid()));
