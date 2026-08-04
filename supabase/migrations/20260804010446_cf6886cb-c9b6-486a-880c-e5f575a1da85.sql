ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS creator_plan_prices jsonb NOT NULL DEFAULT '{"1":0,"3":0,"6":0,"12":0}'::jsonb;

CREATE TABLE IF NOT EXISTS public.support_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link_url text,
  link_label text,
  position integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_guides TO authenticated;
GRANT ALL ON public.support_guides TO service_role;
ALTER TABLE public.support_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read published guides" ON public.support_guides
  FOR SELECT TO authenticated USING (is_published OR public.is_super_admin(auth.uid()));
CREATE TRIGGER support_guides_updated BEFORE UPDATE ON public.support_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.support_guides (title, body, position) VALUES
  ('Getting started', 'Create an account, browse Explore, and take any free quiz. Your scores and badges appear on your profile.', 1),
  ('Creating quizzes', 'Go to Create > New quiz. Paste your questions in the import tab — the offline parser understands numbered questions, options A-D, ticks after the correct option, and Answer:/Explanation: labels.', 2),
  ('Pro creator access', 'Upgrade in Wallet to raise quiz and question limits, unlock AI parsing and analytics. You can pay for 1, 3, 6 or 12 months.', 3),
  ('AI credits', 'AI parsing, question generation and essay marking spend AI credit. Every user gets a free monthly allowance; top up any time in Wallet.', 4),
  ('Affiliate program', 'Share your affiliate link from Wallet and earn a percentage of every creator or AI purchase made by people you invite.', 5),
  ('Withdrawals', 'Add your bank details in Wallet, then request a withdrawal. Requests are reviewed manually and paid to the account on file.', 6)
ON CONFLICT DO NOTHING;