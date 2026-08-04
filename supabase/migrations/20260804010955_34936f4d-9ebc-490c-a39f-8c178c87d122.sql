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

DROP POLICY IF EXISTS "Published guides are readable" ON public.support_guides;
CREATE POLICY "Published guides are readable" ON public.support_guides
  FOR SELECT TO authenticated USING (is_published OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS support_guides_updated ON public.support_guides;
CREATE TRIGGER support_guides_updated BEFORE UPDATE ON public.support_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.support_guides (title, body, position) VALUES
  ('Getting started: create your first quiz', 'Open Create → New quiz. Give it a title, subject and duration (as low as 30 seconds). Then open the Questions tab and either add questions one by one or paste them in bulk and let the parser do the work.', 1),
  ('Pasting questions: supported formats', 'Number questions as 1., 1), Q1 or Question 1. Options can be A. B. C. or a) b) c). Put a tick after the right option, or write "Answer: B" under the question. Use "Explanation:" or "Reason:" for the explanation, "Passage:" for shared reading text, and "Marking scheme:" for theory answers.', 2),
  ('AI credits and how they are spent', 'Every account gets a small free AI credit each month. AI parsing oversight, question generation and essay marking spend from that credit. Top up any time from Wallet by paying to the displayed account and uploading your receipt.', 3),
  ('Pro creator access', 'Free creators can publish a limited number of quizzes and questions per month. Pro creator access raises those limits and unlocks AI parsing and analytics. Buy 1, 3, 6 or 12 months from Wallet.', 4),
  ('Earnings, affiliates and withdrawals', 'Sell quizzes or invite people with your affiliate link to earn. Earnings appear in Wallet. Request a withdrawal once you are above the minimum and the admin will pay out to your saved bank account.', 5)
ON CONFLICT DO NOTHING;