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
