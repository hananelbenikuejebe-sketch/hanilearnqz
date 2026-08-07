CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_exists BOOLEAN;
  meta_handle TEXT := NEW.raw_user_meta_data->>'full_name';
  is_anon BOOLEAN := (NEW.email IS NULL OR NEW.email = '') AND (NEW.raw_user_meta_data->>'guest')::boolean IS TRUE;
  community_id UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, handle, is_guest, device_fingerprint)
  VALUES (
    NEW.id,
    COALESCE(meta_handle, NEW.email, 'Guest'),
    NEW.email,
    meta_handle,
    COALESCE(is_anon, false),
    NEW.raw_user_meta_data->>'fingerprint'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO community_id FROM public.groups WHERE is_community = true ORDER BY created_at ASC LIMIT 1;
  IF community_id IS NOT NULL THEN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (community_id, NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;