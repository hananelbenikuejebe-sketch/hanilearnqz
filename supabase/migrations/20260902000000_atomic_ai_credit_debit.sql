-- Workstream D: close AI-credit loopholes.
-- 1) Ensure the platform-wide AI credit expiry default/value is 30 days (was
--    briefly extended to 45 by client-side math in ensureFreeMonthlyCredit).
ALTER TABLE public.payment_settings ALTER COLUMN ai_credit_expiry_days SET DEFAULT 30;
UPDATE public.payment_settings SET ai_credit_expiry_days = 30 WHERE id = 'default';

-- 2) Atomic, race-proof AI credit debit. Concurrent AI calls for the same user
--    can no longer overdraw the wallet: the row is locked for the duration of
--    the check-and-decrement, and the function refuses (returns false) when
--    the wallet does not exist, the credit has expired, or the balance is
--    insufficient — the caller MUST treat `false` as a hard refusal and never
--    perform the paid AI call (or must have already refused before calling).
CREATE OR REPLACE FUNCTION public.debit_ai_credit(_user_id uuid, _amount_kobo bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance bigint;
  _expires timestamptz;
BEGIN
  IF _amount_kobo <= 0 THEN
    RETURN true;
  END IF;

  SELECT ai_credit_balance_kobo, ai_credit_expires_at
    INTO _balance, _expires
    FROM public.wallets
   WHERE user_id = _user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _expires IS NOT NULL AND _expires < now() THEN
    RETURN false;
  END IF;

  IF _balance IS NULL OR _balance < _amount_kobo THEN
    RETURN false;
  END IF;

  UPDATE public.wallets
     SET ai_credit_balance_kobo = ai_credit_balance_kobo - _amount_kobo
   WHERE user_id = _user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_ai_credit(uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.debit_ai_credit(uuid, bigint) TO service_role;

-- 3) free_credit_grants already has PRIMARY KEY (user_id, period), so the
--    insert in ensureFreeMonthlyCredit is already atomically idempotent per
--    calendar month (a duplicate insert fails and is treated as "already
--    claimed" — see authz.server.ts).
