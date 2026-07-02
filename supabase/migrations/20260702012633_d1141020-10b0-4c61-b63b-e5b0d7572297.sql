
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=_user_id AND role IN ('super_admin','admin')
  )
$$;

CREATE TABLE IF NOT EXISTS public.creator_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_enabled boolean NOT NULL DEFAULT false,
  analytics_enabled boolean NOT NULL DEFAULT true,
  can_publish boolean NOT NULL DEFAULT true,
  max_quizzes int NOT NULL DEFAULT 10,
  notes text,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_permissions TO authenticated;
GRANT ALL ON public.creator_permissions TO service_role;
ALTER TABLE public.creator_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or super can read perms" ON public.creator_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "super manages perms" ON public.creator_permissions
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER creator_perms_updated BEFORE UPDATE ON public.creator_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  banner_path text,
  is_published boolean NOT NULL DEFAULT false,
  order_mode text NOT NULL DEFAULT 'sequential',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published or own exam" ON public.exams
  FOR SELECT TO authenticated USING (is_published OR created_by = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "creator writes own exam" ON public.exams
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "owner updates exam" ON public.exams
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "owner deletes exam" ON public.exams
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE TRIGGER exams_updated BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.exam_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, quiz_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_quizzes TO authenticated;
GRANT ALL ON public.exam_quizzes TO service_role;
ALTER TABLE public.exam_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read exam_quizzes if exam readable" ON public.exam_quizzes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id
      AND (e.is_published OR e.created_by = auth.uid() OR public.is_super_admin(auth.uid())))
  );
CREATE POLICY "owner writes exam_quizzes" ON public.exam_quizzes
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id
      AND (e.created_by = auth.uid() OR public.is_super_admin(auth.uid())))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id
      AND (e.created_by = auth.uid() OR public.is_super_admin(auth.uid())))
  );
