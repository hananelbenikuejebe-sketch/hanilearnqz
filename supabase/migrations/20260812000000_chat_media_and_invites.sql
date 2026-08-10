-- ============ Chat media attachments (DM + group) ============
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text CHECK (attachment_type IN ('image','audio')),
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_duration_sec integer;

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text CHECK (attachment_type IN ('image','audio')),
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_duration_sec integer;

-- Allow a text body to be empty when an attachment is present (server still
-- validates at least one of body/attachment is set).
ALTER TABLE public.direct_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.group_messages ALTER COLUMN body DROP NOT NULL;

-- ============ Private bucket for chat media ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Bucket is private; all reads/writes go through server functions using the
-- service role, which bypasses RLS entirely. No object policies are granted
-- to regular authenticated clients.

-- ============ Group invite links ============
CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON public.group_invites (group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON public.group_invites (token);

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_invites TO authenticated;
GRANT ALL ON public.group_invites TO service_role;

DROP POLICY IF EXISTS "Group invites: members view" ON public.group_invites;
CREATE POLICY "Group invites: members view" ON public.group_invites FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_invites.group_id AND gm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Group invites: members create" ON public.group_invites;
CREATE POLICY "Group invites: members create" ON public.group_invites FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_invites.group_id AND gm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Group invites: creator delete" ON public.group_invites;
CREATE POLICY "Group invites: creator delete" ON public.group_invites FOR DELETE TO authenticated
  USING (created_by = auth.uid());
