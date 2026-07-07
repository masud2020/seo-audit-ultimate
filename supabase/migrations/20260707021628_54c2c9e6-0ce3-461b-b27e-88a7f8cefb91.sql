CREATE TABLE public.mega_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  target_url TEXT NOT NULL,
  competitor_url TEXT,
  target_keyword TEXT,
  max_pages INTEGER NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  status_message TEXT,
  overall_score INTEGER,
  results JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mega_audits TO authenticated;
GRANT ALL ON public.mega_audits TO service_role;
ALTER TABLE public.mega_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mega_audits" ON public.mega_audits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.mega_audits_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER mega_audits_updated_at BEFORE UPDATE ON public.mega_audits FOR EACH ROW EXECUTE FUNCTION public.mega_audits_touch_updated_at();
CREATE INDEX mega_audits_user_created_idx ON public.mega_audits(user_id, created_at DESC);