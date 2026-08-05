-- ============ AI provider tracking ============
ALTER TABLE public.ai_usage_log ADD COLUMN IF NOT EXISTS provider text;

-- ============ payment settings additions ============
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS topup_fee_pct numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS withdrawal_fee_pct numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS openrouter_model text NOT NULL DEFAULT 'openrouter/free',
  ADD COLUMN IF NOT EXISTS openrouter_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_heavy_provider text NOT NULL DEFAULT 'openrouter',
  ADD COLUMN IF NOT EXISTS ai_light_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS ai_min_charge_kobo integer NOT NULL DEFAULT 10;

-- ============ quizzes additions ============
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS banner_color text,
  ADD COLUMN IF NOT EXISTS competition_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS prize_pool_kobo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prizes_awarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS show_score_as_points boolean NOT NULL DEFAULT true;

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS points_awarded numeric,
  ADD COLUMN IF NOT EXISTS points_max numeric;

-- ============ quiz sections ============
CREATE TABLE IF NOT EXISTS public.quiz_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  position integer NOT NULL DEFAULT 0,
  total_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quiz_sections_quiz_idx ON public.quiz_sections(quiz_id, position);
GRANT SELECT ON public.quiz_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_sections TO authenticated;
GRANT ALL ON public.quiz_sections TO service_role;
ALTER TABLE public.quiz_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sections readable" ON public.quiz_sections;
CREATE POLICY "sections readable" ON public.quiz_sections FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manages sections" ON public.quiz_sections;
CREATE POLICY "owner manages sections" ON public.quiz_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = auth.uid()));

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.quiz_sections(id) ON DELETE SET NULL;

-- ============ quiz prizes ============
CREATE TABLE IF NOT EXISTS public.quiz_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 10),
  amount_kobo integer NOT NULL DEFAULT 0,
  awarded_to uuid,
  awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, position)
);
GRANT SELECT ON public.quiz_prizes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_prizes TO authenticated;
GRANT ALL ON public.quiz_prizes TO service_role;
ALTER TABLE public.quiz_prizes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prizes readable" ON public.quiz_prizes;
CREATE POLICY "prizes readable" ON public.quiz_prizes FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manages prizes" ON public.quiz_prizes;
CREATE POLICY "owner manages prizes" ON public.quiz_prizes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = auth.uid()));

-- ============ ads ============
CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  cta_label text,
  cta_url text,
  placements text[] NOT NULL DEFAULT ARRAY['explore']::text[],
  active boolean NOT NULL DEFAULT true,
  auto_show boolean NOT NULL DEFAULT true,
  weight integer NOT NULL DEFAULT 1,
  every_n integer NOT NULL DEFAULT 6,
  start_at timestamptz,
  end_at timestamptz,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ads TO anon;
GRANT SELECT ON public.ads TO authenticated;
GRANT ALL ON public.ads TO service_role;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active ads readable" ON public.ads;
CREATE POLICY "active ads readable" ON public.ads FOR SELECT USING (active = true);
DROP POLICY IF EXISTS "admins manage ads" ON public.ads;
CREATE POLICY "admins manage ads" ON public.ads FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
DROP TRIGGER IF EXISTS ads_updated ON public.ads;
CREATE TRIGGER ads_updated BEFORE UPDATE ON public.ads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id uuid,
  kind text NOT NULL CHECK (kind IN ('impression','click')),
  placement text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.ad_events TO anon, authenticated;
GRANT ALL ON public.ad_events TO service_role;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone can record ad events" ON public.ad_events;
CREATE POLICY "anyone can record ad events" ON public.ad_events FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "admins read ad events" ON public.ad_events;
CREATE POLICY "admins read ad events" ON public.ad_events FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- ============ notifications ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  link text,
  image_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own notifications" ON public.notifications;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "update own notifications" ON public.notifications;
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "delete own notifications" ON public.notifications;
CREATE POLICY "delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text,
  auth text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own push subs" ON public.push_subscriptions;
CREATE POLICY "own push subs" ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ groups ============
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_community boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "groups readable" ON public.groups;
CREATE POLICY "groups readable" ON public.groups FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members readable" ON public.group_members;
CREATE POLICY "members readable" ON public.group_members FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_messages_idx ON public.group_messages(group_id, created_at DESC);
GRANT SELECT, INSERT ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read messages" ON public.group_messages;
CREATE POLICY "members read messages" ON public.group_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS "members send messages" ON public.group_messages;
CREATE POLICY "members send messages" ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid()));

-- seed the global community
INSERT INTO public.groups (name, description, is_community)
SELECT 'HaniLearn Community', 'Everyone on HaniLearn-QZ is here. Say hello!', true
WHERE NOT EXISTS (SELECT 1 FROM public.groups WHERE is_community = true);

INSERT INTO public.group_members (group_id, user_id)
SELECT g.id, p.id FROM public.groups g CROSS JOIN public.profiles p
WHERE g.is_community = true
ON CONFLICT DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;