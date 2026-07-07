-- report_recommendations: cache of AI-generated recommendations per report section
CREATE TABLE public.report_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  report_id uuid NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('audit','site_audit','tool_run')),
  section_slug text NOT NULL,
  summary text NOT NULL DEFAULT '',
  fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, report_type, section_slug)
);
CREATE INDEX report_recommendations_user_idx ON public.report_recommendations(user_id);
CREATE INDEX report_recommendations_lookup_idx ON public.report_recommendations(report_id, report_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_recommendations TO authenticated;
GRANT ALL ON public.report_recommendations TO service_role;

ALTER TABLE public.report_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their recommendations"
  ON public.report_recommendations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.report_recommendations_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.report_recommendations_touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER report_recommendations_touch_updated_at
  BEFORE UPDATE ON public.report_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.report_recommendations_touch_updated_at();

-- report_shares: signed, expiring share tokens for read-only report links
CREATE TABLE public.report_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  report_id uuid NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('audit','site_audit','tool_run')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_shares_user_idx ON public.report_shares(user_id);
CREATE INDEX report_shares_token_idx ON public.report_shares(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_shares TO authenticated;
GRANT ALL ON public.report_shares TO service_role;

ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

-- Owner-only management. Public share resolution goes through a server
-- function using the admin client; the table itself stays private.
CREATE POLICY "Owners can manage their share links"
  ON public.report_shares FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);