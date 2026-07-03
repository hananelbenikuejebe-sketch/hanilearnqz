
-- Profiles enrichment for guests + public profile pages
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_device_fingerprint_uidx
  ON public.profiles(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_uidx
  ON public.profiles(lower(handle)) WHERE handle IS NOT NULL;

-- Public read of safe profile columns (used for creator attribution and profile pages)
DROP POLICY IF EXISTS "Profiles: public directory" ON public.profiles;
CREATE POLICY "Profiles: public directory" ON public.profiles FOR SELECT TO authenticated USING (true);

-- Auto-populate handle from user_metadata for both real users AND anonymous guests
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_exists BOOLEAN;
  meta_handle TEXT := NEW.raw_user_meta_data->>'full_name';
  is_anon BOOLEAN := (NEW.email IS NULL OR NEW.email = '') AND (NEW.raw_user_meta_data->>'guest')::boolean IS TRUE;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, handle, is_guest, device_fingerprint)
  VALUES (
    NEW.id,
    COALESCE(meta_handle, NEW.email, 'Guest'),
    NEW.email,
    meta_handle,
    COALESCE(is_anon, false),
    NEW.raw_user_meta_data->>'fingerprint'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing anonymous users into profiles so they show up in student list
INSERT INTO public.profiles (id, full_name, email, is_guest)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', 'Guest'), u.email,
       (u.email IS NULL OR u.email = '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Owner-can-edit policies for quizzes / questions / options
DROP POLICY IF EXISTS "Quizzes: owner manage" ON public.quizzes;
CREATE POLICY "Quizzes: owner manage" ON public.quizzes
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Questions: owner manage" ON public.questions;
CREATE POLICY "Questions: owner manage" ON public.questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = questions.quiz_id AND q.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = questions.quiz_id AND q.created_by = auth.uid()));

DROP POLICY IF EXISTS "Options: owner manage" ON public.options;
CREATE POLICY "Options: owner manage" ON public.options
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.questions qs JOIN public.quizzes q ON q.id = qs.quiz_id
    WHERE qs.id = options.question_id AND q.created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.questions qs JOIN public.quizzes q ON q.id = qs.quiz_id
    WHERE qs.id = options.question_id AND q.created_by = auth.uid()
  ));

-- AI usage log
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  credits_cost numeric(10,4) DEFAULT 0,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_usage read own or super" ON public.ai_usage_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "ai_usage insert own" ON public.ai_usage_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Followers
CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;
GRANT ALL ON public.user_follows TO service_role;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows readable" ON public.user_follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows own insert" ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows own delete" ON public.user_follows FOR DELETE TO authenticated
  USING (follower_id = auth.uid());
