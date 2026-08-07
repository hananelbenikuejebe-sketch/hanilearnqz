-- Ads: self-serve creator ads with pricing, approval and free tier
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS frequency_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS price_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS days integer NOT NULL DEFAULT 1;

UPDATE public.ads SET status = 'approved' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS ads_status_idx ON public.ads (status, active);
CREATE INDEX IF NOT EXISTS ads_created_by_idx ON public.ads (created_by);

DROP POLICY IF EXISTS "Creators manage own ads" ON public.ads;
CREATE POLICY "Creators manage own ads" ON public.ads
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Ad pricing + free tier knobs (admin editable)
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS ad_base_day_kobo integer NOT NULL DEFAULT 20000,
  ADD COLUMN IF NOT EXISTS ad_extra_placement_pct integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ad_weight_pct_per_10 integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS ad_frequency_pct integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS ad_free_tier_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ad_free_days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ad_free_placements integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ad_free_monthly_limit integer NOT NULL DEFAULT 1;

-- Per-user in-app guide/tour progress (first-visit overlays)
CREATE TABLE IF NOT EXISTS public.user_tour_progress (
  user_id uuid NOT NULL,
  tour_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tour_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tour_progress TO authenticated;
GRANT ALL ON public.user_tour_progress TO service_role;
ALTER TABLE public.user_tour_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own tour progress" ON public.user_tour_progress;
CREATE POLICY "Own tour progress" ON public.user_tour_progress
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Per-user saved nav bar layout (drag & drop bottom nav)
CREATE TABLE IF NOT EXISTS public.user_nav_prefs (
  user_id uuid NOT NULL PRIMARY KEY,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_nav_prefs TO authenticated;
GRANT ALL ON public.user_nav_prefs TO service_role;
ALTER TABLE public.user_nav_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own nav prefs" ON public.user_nav_prefs;
CREATE POLICY "Own nav prefs" ON public.user_nav_prefs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());