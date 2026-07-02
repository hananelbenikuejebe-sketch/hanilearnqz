
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='creator' AND enumtypid='public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'creator';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='super_admin' AND enumtypid='public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subsection text;
