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
