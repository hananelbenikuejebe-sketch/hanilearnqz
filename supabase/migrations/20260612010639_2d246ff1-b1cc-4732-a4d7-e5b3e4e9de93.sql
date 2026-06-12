CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS "Settings: admins manage" ON public.app_settings;
CREATE POLICY "Settings: admins manage" ON public.app_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Attempts: admins manage" ON public.attempts;
CREATE POLICY "Attempts: admins manage" ON public.attempts FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Profiles: admins manage" ON public.profiles;
CREATE POLICY "Profiles: admins manage" ON public.profiles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Profiles: admins read all" ON public.profiles;
CREATE POLICY "Profiles: admins read all" ON public.profiles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Questions: admins manage" ON public.questions;
CREATE POLICY "Questions: admins manage" ON public.questions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Options: admins manage" ON public.options;
CREATE POLICY "Options: admins manage" ON public.options FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Quizzes: admins manage" ON public.quizzes;
CREATE POLICY "Quizzes: admins manage" ON public.quizzes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Roles: admins read all" ON public.user_roles;
CREATE POLICY "Roles: admins read all" ON public.user_roles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can view visible quiz comments" ON public.quiz_comments;
CREATE POLICY "Authenticated users can view visible quiz comments"
  ON public.quiz_comments FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR (
      is_hidden = false
      AND EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_comments.quiz_id AND q.is_published = true
      )
    )
  );
DROP POLICY IF EXISTS "Students and admins can delete quiz comments" ON public.quiz_comments;
CREATE POLICY "Students and admins can delete quiz comments"
  ON public.quiz_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Students can edit their own visible comments and admins can mod" ON public.quiz_comments;
DROP POLICY IF EXISTS "Students can edit their own visible comments and admins can moderate" ON public.quiz_comments;
CREATE POLICY "Students can edit their own visible comments and admins can moderate"
  ON public.quiz_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    private.has_role(auth.uid(), 'admin')
    OR (user_id = auth.uid() AND is_hidden = false)
  );

DROP POLICY IF EXISTS "Authenticated users can view quiz likes" ON public.quiz_likes;
CREATE POLICY "Authenticated users can view quiz likes"
  ON public.quiz_likes FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_likes.quiz_id AND q.is_published = true
    )
  );
DROP POLICY IF EXISTS "Students and admins can remove quiz likes" ON public.quiz_likes;
CREATE POLICY "Students and admins can remove quiz likes"
  ON public.quiz_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;