-- ============================================================
-- Workstream A: automatic AI notification engine
--  - dedupe table so each user gets at most one AI-generated
--    daily notification per calendar day
--  - curated motivational/educational image rotation setting
--  - pg_cron + pg_net job that calls the daily-notify cron route
--    once a day with no manual button press required
-- ============================================================

-- ---------- dedupe table ----------
CREATE TABLE IF NOT EXISTS public.ai_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  kind text NOT NULL DEFAULT 'daily_ai',
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sent_on, kind)
);
CREATE INDEX IF NOT EXISTS ai_notification_log_user_idx ON public.ai_notification_log(user_id, sent_on);

GRANT SELECT ON public.ai_notification_log TO authenticated;
GRANT ALL ON public.ai_notification_log TO service_role;
ALTER TABLE public.ai_notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ai notification log" ON public.ai_notification_log;
CREATE POLICY "own ai notification log" ON public.ai_notification_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- ---------- curated motivational/educational image rotation ----------
-- Admin-editable via app_settings (existing "Settings: admins manage" policy).
-- No Pinterest scraping — a fixed, admin-curated list rotated per send.
INSERT INTO public.app_settings (key, value)
VALUES (
  'ai_notification_images',
  '[
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=60"
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ---------- pg_cron + pg_net daily schedule ----------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-ai-notify';

SELECT cron.schedule(
  'daily-ai-notify',
  '0 8 * * *', -- 08:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://project--758b6d1b-d120-4f5b-ad40-12f29def2e3b.lovable.app/api/public/cron/daily-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '34280f7154ae8f18bdc85d6435140448cf9cbe861c5f34e5'
    ),
    body := '{}'::jsonb
  );
  $$
);
-- Lightweight behavior/event tracking for the "For You" feed and shared
-- interest-profile intelligence layer (notifications AI, ads, tour guide).
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'impression' | 'open' | 'shown_for_you' | etc.
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_quiz_id ON public.user_events (quiz_id);
CREATE INDEX IF NOT EXISTS idx_user_events_kind ON public.user_events (kind);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.user_events TO authenticated;
GRANT ALL ON public.user_events TO service_role;

DROP POLICY IF EXISTS "Events: users insert own" ON public.user_events;
CREATE POLICY "Events: users insert own" ON public.user_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Events: users read own" ON public.user_events;
CREATE POLICY "Events: users read own" ON public.user_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'super_admin'));
-- ============ Chat media attachments (DM + group) ============
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text CHECK (attachment_type IN ('image','audio')),
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_duration_sec integer;

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text CHECK (attachment_type IN ('image','audio')),
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_duration_sec integer;

-- Allow a text body to be empty when an attachment is present (server still
-- validates at least one of body/attachment is set).
ALTER TABLE public.direct_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.group_messages ALTER COLUMN body DROP NOT NULL;

-- Chat media lives in the private `chat-media` bucket (created separately).
-- All reads/writes go through server functions using the
-- service role, which bypasses RLS entirely. No object policies are granted
-- to regular authenticated clients.

-- ============ Group invite links ============
CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON public.group_invites (group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON public.group_invites (token);

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_invites TO authenticated;
GRANT ALL ON public.group_invites TO service_role;

DROP POLICY IF EXISTS "Group invites: members view" ON public.group_invites;
CREATE POLICY "Group invites: members view" ON public.group_invites FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_invites.group_id AND gm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Group invites: members create" ON public.group_invites;
CREATE POLICY "Group invites: members create" ON public.group_invites FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_invites.group_id AND gm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Group invites: creator delete" ON public.group_invites;
CREATE POLICY "Group invites: creator delete" ON public.group_invites FOR DELETE TO authenticated
  USING (created_by = auth.uid());
-- Persist which ambient coach-mark tips a user has already seen, so returning
-- users get fresh tips instead of repeats (used by src/components/coach-marks.tsx).
CREATE TABLE IF NOT EXISTS public.user_seen_tips (
  user_id uuid NOT NULL,
  tip_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tip_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_seen_tips TO authenticated;
GRANT ALL ON public.user_seen_tips TO service_role;
ALTER TABLE public.user_seen_tips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own seen tips" ON public.user_seen_tips;
CREATE POLICY "Own seen tips" ON public.user_seen_tips
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
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
-- Workstream D: close AI-credit loopholes.
-- 1) Ensure the platform-wide AI credit expiry default/value is 30 days (was
--    briefly extended to 45 by client-side math in ensureFreeMonthlyCredit).
ALTER TABLE public.payment_settings ALTER COLUMN ai_credit_expiry_days SET DEFAULT 30;
UPDATE public.payment_settings SET ai_credit_expiry_days = 30 WHERE id = 'default';

-- 2) Atomic, race-proof AI credit debit. Concurrent AI calls for the same user
--    can no longer overdraw the wallet: the row is locked for the duration of
--    the check-and-decrement, and the function refuses (returns false) when
--    the wallet does not exist, the credit has expired, or the balance is
--    insufficient — the caller MUST treat `false` as a hard refusal and never
--    perform the paid AI call (or must have already refused before calling).
CREATE OR REPLACE FUNCTION public.debit_ai_credit(_user_id uuid, _amount_kobo bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance bigint;
  _expires timestamptz;
BEGIN
  IF _amount_kobo <= 0 THEN
    RETURN true;
  END IF;

  SELECT ai_credit_balance_kobo, ai_credit_expires_at
    INTO _balance, _expires
    FROM public.wallets
   WHERE user_id = _user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _expires IS NOT NULL AND _expires < now() THEN
    RETURN false;
  END IF;

  IF _balance IS NULL OR _balance < _amount_kobo THEN
    RETURN false;
  END IF;

  UPDATE public.wallets
     SET ai_credit_balance_kobo = ai_credit_balance_kobo - _amount_kobo
   WHERE user_id = _user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_ai_credit(uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.debit_ai_credit(uuid, bigint) TO service_role;

-- 3) free_credit_grants already has PRIMARY KEY (user_id, period), so the
--    insert in ensureFreeMonthlyCredit is already atomically idempotent per
--    calendar month (a duplicate insert fails and is treated as "already
--    claimed" — see authz.server.ts).