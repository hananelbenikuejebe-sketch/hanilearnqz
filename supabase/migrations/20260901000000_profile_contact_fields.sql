-- Public profile enrichment: bio (already exists), contact + social links, school/level.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS school text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Users may update their own profile's editable fields (RLS already allows
-- authenticated SELECT via "Profiles: public directory"; add explicit self-update).
DROP POLICY IF EXISTS "Profiles: self update" ON public.profiles;
CREATE POLICY "Profiles: self update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
