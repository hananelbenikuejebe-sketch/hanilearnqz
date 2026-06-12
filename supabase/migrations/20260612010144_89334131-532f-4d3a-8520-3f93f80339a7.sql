ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS allow_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_likes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_sharing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_leaderboard boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.quiz_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.quiz_likes TO authenticated;
GRANT ALL ON public.quiz_likes TO service_role;
ALTER TABLE public.quiz_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view quiz likes"
  ON public.quiz_likes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_likes.quiz_id AND q.is_published = true
    )
  );
CREATE POLICY "Students can like published quizzes that allow likes"
  ON public.quiz_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_likes.quiz_id AND q.is_published = true AND q.allow_likes = true
    )
  );
CREATE POLICY "Students and admins can remove quiz likes"
  ON public.quiz_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.quiz_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_comments TO authenticated;
GRANT ALL ON public.quiz_comments TO service_role;
ALTER TABLE public.quiz_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view visible quiz comments"
  ON public.quiz_comments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR (
      is_hidden = false
      AND EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_comments.quiz_id AND q.is_published = true
      )
    )
  );
CREATE POLICY "Students can comment on published quizzes that allow comments"
  ON public.quiz_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_hidden = false
    AND EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_comments.quiz_id AND q.is_published = true AND q.allow_comments = true
    )
  );
CREATE POLICY "Students can edit their own visible comments and admins can moderate"
  ON public.quiz_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (user_id = auth.uid() AND is_hidden = false)
  );
CREATE POLICY "Students and admins can delete quiz comments"
  ON public.quiz_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_quiz_comments_updated_at
  BEFORE UPDATE ON public.quiz_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.quiz_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'copy_link',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.quiz_shares TO authenticated;
GRANT ALL ON public.quiz_shares TO service_role;
ALTER TABLE public.quiz_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and owners can view quiz shares"
  ON public.quiz_shares FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "Authenticated users can record allowed quiz shares"
  ON public.quiz_shares FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR user_id IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_shares.quiz_id AND q.is_published = true AND q.allow_sharing = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_quiz_likes_quiz_id ON public.quiz_likes(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_comments_quiz_id_created_at ON public.quiz_comments(quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_shares_quiz_id_created_at ON public.quiz_shares(quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz_score ON public.attempts(quiz_id, score_pct DESC, time_taken_sec ASC);