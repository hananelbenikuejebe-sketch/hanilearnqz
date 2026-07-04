-- =========================================================================
-- Payments, wallets, subscriptions, affiliates, withdrawals
-- =========================================================================

-- ---------- payment_settings (singleton) ----------
CREATE TABLE public.payment_settings (
  id text PRIMARY KEY DEFAULT 'default',
  creator_access_price_kobo integer NOT NULL DEFAULT 300000,
  creator_access_duration_days integer NOT NULL DEFAULT 30,
  creator_access_quiz_cap integer NOT NULL DEFAULT 30,
  creator_access_includes_ai boolean NOT NULL DEFAULT false,
  ai_result_price_kobo integer NOT NULL DEFAULT 200,
  ai_essay_price_kobo integer NOT NULL DEFAULT 800,
  ai_parser_rate_per_1k_input_kobo integer NOT NULL DEFAULT 200,
  ai_parser_rate_per_1k_output_kobo integer NOT NULL DEFAULT 600,
  ai_credit_min_topup_kobo integer NOT NULL DEFAULT 30000,
  ai_credit_expiry_days integer NOT NULL DEFAULT 30,
  feature_locks jsonb NOT NULL DEFAULT '{"ai_result": false, "ai_essay": false, "ai_parser": false, "creator_signup": false}'::jsonb,
  affiliate_pct integer NOT NULL DEFAULT 20,
  withdrawal_min_kobo integer NOT NULL DEFAULT 100000,
  withdrawal_whatsapp text NOT NULL DEFAULT '+2349071829295',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable by all authenticated" ON public.payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin write" ON public.payment_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.payment_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- ---------- wallets ----------
CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_kobo bigint NOT NULL DEFAULT 0,
  ai_credit_balance_kobo bigint NOT NULL DEFAULT 0,
  ai_credit_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet self read" ON public.wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ---------- wallet_transactions ----------
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount_kobo bigint NOT NULL,
  bucket text NOT NULL DEFAULT 'earnings',
  status text NOT NULL DEFAULT 'complete',
  monnify_ref text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_tx_user_idx ON public.wallet_transactions (user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx self read" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ---------- payment_intents ----------
CREATE TABLE public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_reference text NOT NULL UNIQUE,
  purpose text NOT NULL,
  amount_kobo bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  monnify_tx_ref text,
  affiliate_user_id uuid REFERENCES auth.users(id),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX payment_intents_user_idx ON public.payment_intents (user_id, created_at DESC);
GRANT SELECT ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intent self read" ON public.payment_intents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ---------- subscriptions ----------
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'creator_access',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source_payment_intent uuid REFERENCES public.payment_intents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subs_user_idx ON public.subscriptions (user_id, expires_at DESC);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs self read" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ---------- affiliate ----------
CREATE TABLE public.affiliate_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  clicks integer NOT NULL DEFAULT 0,
  signups integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.affiliate_codes TO authenticated;
GRANT ALL ON public.affiliate_codes TO service_role;
ALTER TABLE public.affiliate_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aff code self read" ON public.affiliate_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "aff code self insert" ON public.affiliate_codes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- Public lookup by code (for tracking clicks / signup redemption) is done via server functions with service role.

CREATE TABLE public.affiliate_attributions (
  referred_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aff_attr_aff_idx ON public.affiliate_attributions (affiliate_user_id);
GRANT SELECT ON public.affiliate_attributions TO authenticated;
GRANT ALL ON public.affiliate_attributions TO service_role;
ALTER TABLE public.affiliate_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aff attr participants" ON public.affiliate_attributions FOR SELECT TO authenticated
  USING (referred_user_id = auth.uid() OR affiliate_user_id = auth.uid()
         OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ---------- bank_accounts ----------
CREATE TABLE public.bank_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank self all" ON public.bank_accounts FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (user_id = auth.uid());

-- ---------- withdrawal_requests ----------
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_kobo bigint NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX withdrawal_user_idx ON public.withdrawal_requests (user_id, created_at DESC);
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wdr self read" ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ---------- monnify webhook idempotency ----------
CREATE TABLE public.monnify_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  transaction_reference text UNIQUE,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.monnify_webhook_events TO service_role;
ALTER TABLE public.monnify_webhook_events ENABLE ROW LEVEL SECURITY;
-- No authenticated policy: this table is service-role only.

-- ---------- Helper: has_active_creator_subscription ----------
CREATE OR REPLACE FUNCTION public.has_active_creator_subscription(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND kind = 'creator_access'
      AND active = true
      AND expires_at > now()
  )
$$;

-- ---------- updated_at trigger reuse ----------
CREATE TRIGGER trg_payment_settings_updated BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bank_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();