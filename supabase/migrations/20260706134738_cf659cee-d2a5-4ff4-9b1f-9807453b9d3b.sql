CREATE TABLE public.gsc_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_url TEXT NOT NULL,
  token TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_url)
);

GRANT SELECT ON public.gsc_verifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_verifications TO authenticated;
GRANT ALL ON public.gsc_verifications TO service_role;

ALTER TABLE public.gsc_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read tokens for meta tag embedding"
  ON public.gsc_verifications FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users manage their own verifications insert"
  ON public.gsc_verifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own verifications update"
  ON public.gsc_verifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own verifications delete"
  ON public.gsc_verifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.gsc_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER gsc_verifications_updated_at
  BEFORE UPDATE ON public.gsc_verifications
  FOR EACH ROW EXECUTE FUNCTION public.gsc_update_updated_at();