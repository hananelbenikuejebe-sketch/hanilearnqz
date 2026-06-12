CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles admin_roles
      WHERE admin_roles.user_id = auth.uid()
        AND admin_roles.role = 'admin'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles roles
    WHERE roles.user_id = _user_id
      AND roles.role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;