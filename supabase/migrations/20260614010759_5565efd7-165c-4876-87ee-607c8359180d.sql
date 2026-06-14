
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS points numeric(8,2);
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subsection text;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS total_score numeric(8,2);
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS awarded numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS ai_feedback jsonb;

-- Allow anonymous/guest authenticated users to read published quizzes & questions, and insert their own attempts.
-- (RLS policies already include `authenticated` role; Supabase anonymous sessions are role=authenticated with is_anonymous=true,
-- so existing policies already cover them. We add explicit guest-friendly social policies.)

-- Allow anyone authenticated (incl. anonymous) to like/comment/share if the quiz allows it (already in place via existing policies).
-- No further policy changes needed; columns above are additive.
