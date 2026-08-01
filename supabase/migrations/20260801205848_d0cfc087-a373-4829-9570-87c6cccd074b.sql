ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS free_tier_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_max_questions_per_quiz integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS free_max_quizzes_per_month integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS free_offline_parse_limit integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS free_ai_parse boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_monthly_ai_credit_kobo integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS proof_auto_approve boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS proof_min_confidence integer NOT NULL DEFAULT 55,
  ADD COLUMN IF NOT EXISTS proof_laxity text NOT NULL DEFAULT 'lax',
  ADD COLUMN IF NOT EXISTS proof_max_age_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS proof_use_ai boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pay_bank_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pay_account_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pay_account_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_whatsapp text NOT NULL DEFAULT '+2349071829295',
  ADD COLUMN IF NOT EXISTS ai_generate_price_kobo integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS ai_review_price_kobo integer NOT NULL DEFAULT 500;

ALTER TABLE public.ai_usage_log ALTER COLUMN credits_cost TYPE numeric(14,4);

CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_intent_id uuid REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  amount_kobo bigint NOT NULL,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  auto_confidence integer NOT NULL DEFAULT 0,
  auto_reason text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted boolean NOT NULL DEFAULT false,
  used_ai boolean NOT NULL DEFAULT false,
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_proofs TO authenticated;
GRANT ALL ON public.payment_proofs TO service_role;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proofs read own or admin" ON public.payment_proofs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER payment_proofs_updated_at BEFORE UPDATE ON public.payment_proofs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS payment_proofs_status_idx ON public.payment_proofs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_proofs_user_idx ON public.payment_proofs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.free_credit_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount_kobo integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period)
);

GRANT SELECT ON public.free_credit_grants TO authenticated;
GRANT ALL ON public.free_credit_grants TO service_role;
ALTER TABLE public.free_credit_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "free grants read own or admin" ON public.free_credit_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON public.ai_usage_log (user_id, created_at DESC);