
-- 1) Add price_kobo to quizzes (0 = free)
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS price_kobo integer NOT NULL DEFAULT 0;
ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_price_kobo_check;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_price_kobo_check CHECK (price_kobo >= 0 AND price_kobo <= 10000000);

-- 2) Platform fee % on paid quiz sales (editable, capped 0-90)
ALTER TABLE public.payment_settings ADD COLUMN IF NOT EXISTS quiz_platform_fee_pct integer NOT NULL DEFAULT 10;
ALTER TABLE public.payment_settings DROP CONSTRAINT IF EXISTS payment_settings_quiz_fee_pct_check;
ALTER TABLE public.payment_settings ADD CONSTRAINT payment_settings_quiz_fee_pct_check CHECK (quiz_platform_fee_pct >= 0 AND quiz_platform_fee_pct <= 90);

-- 3) Quiz purchases (student paid access to a private priced quiz)
CREATE TABLE IF NOT EXISTS public.quiz_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  payment_intent_id uuid REFERENCES public.payment_intents(id),
  price_kobo integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quiz_id)
);

GRANT SELECT ON public.quiz_purchases TO authenticated;
GRANT ALL ON public.quiz_purchases TO service_role;

ALTER TABLE public.quiz_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own quiz purchases" ON public.quiz_purchases;
CREATE POLICY "Users can view their own quiz purchases"
  ON public.quiz_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Creators can see purchases of their quizzes" ON public.quiz_purchases;
CREATE POLICY "Creators can see purchases of their quizzes"
  ON public.quiz_purchases FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = auth.uid()));

CREATE INDEX IF NOT EXISTS quiz_purchases_user_id_idx ON public.quiz_purchases(user_id);
CREATE INDEX IF NOT EXISTS quiz_purchases_quiz_id_idx ON public.quiz_purchases(quiz_id);
