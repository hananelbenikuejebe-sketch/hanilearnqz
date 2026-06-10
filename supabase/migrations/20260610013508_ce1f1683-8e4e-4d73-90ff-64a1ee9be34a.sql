ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  ADD COLUMN IF NOT EXISTS access_key TEXT,
  ADD COLUMN IF NOT EXISTS input_method TEXT NOT NULL DEFAULT 'manual' CHECK (input_method IN ('upload', 'paste', 'manual')),
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS parsing_settings JSONB NOT NULL DEFAULT '{"strictness":"normal","auto_detect_type":true,"confidence_threshold":80,"default_question_type":"mcq","ask_confirmation":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS raw_import_text TEXT,
  ADD COLUMN IF NOT EXISTS sample_answer TEXT;

CREATE INDEX IF NOT EXISTS quizzes_visibility_idx ON public.quizzes(visibility);
CREATE INDEX IF NOT EXISTS questions_needs_review_idx ON public.questions(quiz_id, needs_review);