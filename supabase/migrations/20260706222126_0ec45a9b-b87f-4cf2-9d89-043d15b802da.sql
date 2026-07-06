CREATE TABLE public.site_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  start_url text NOT NULL,
  max_pages integer NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'pending',
  pages_audited integer NOT NULL DEFAULT 0,
  overall_score integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_audits TO authenticated;
GRANT ALL ON public.site_audits TO service_role;

ALTER TABLE public.site_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own site audits"
  ON public.site_audits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.site_audits_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER site_audits_updated_at
  BEFORE UPDATE ON public.site_audits
  FOR EACH ROW EXECUTE FUNCTION public.site_audits_touch_updated_at();

CREATE INDEX site_audits_user_created_idx ON public.site_audits (user_id, created_at DESC);