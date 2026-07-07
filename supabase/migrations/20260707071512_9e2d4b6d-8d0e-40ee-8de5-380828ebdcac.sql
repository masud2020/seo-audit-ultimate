
-- 1. Add approval columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approval_note TEXT;

-- 2. Helper: is a user's access currently approved (admins always are)?
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = _user_id
        AND approval_status = 'approved'
        AND (approved_until IS NULL OR approved_until > now())
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_user_approved(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_approved(UUID) TO authenticated, service_role;

-- 3. Admin RLS policies for approval management on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Auto-approve whitelisted admins on signup
CREATE OR REPLACE FUNCTION public.grant_admin_for_whitelisted_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.email IS NOT NULL
     AND lower(new.email) IN ('timnub@gmail.com','masud2mkt@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    -- Auto-approve admins for a long time
    UPDATE public.profiles
      SET approval_status = 'approved',
          approved_until = now() + interval '100 years',
          approved_by = new.id,
          approval_note = 'Auto-approved (whitelisted admin)'
      WHERE user_id = new.id;
  END IF;
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_admin_for_whitelisted_email() FROM PUBLIC, anon, authenticated;
