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
