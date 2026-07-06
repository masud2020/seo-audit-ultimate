
CREATE TABLE public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  overall_score INTEGER,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_recommendations JSONB DEFAULT '[]'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audits TO authenticated;
GRANT ALL ON public.audits TO service_role;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audits" ON public.audits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX audits_user_created_idx ON public.audits(user_id, created_at DESC);

CREATE TABLE public.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  target_url TEXT NOT NULL,
  current_position INTEGER,
  previous_position INTEGER,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keywords TO authenticated;
GRANT ALL ON public.keywords TO service_role;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own keywords" ON public.keywords FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_progress TO authenticated;
GRANT ALL ON public.checklist_progress TO service_role;
ALTER TABLE public.checklist_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checklist" ON public.checklist_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.api_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable',
  groq_key TEXT,
  gemini_key TEXT,
  openai_key TEXT,
  perplexity_key TEXT,
  claude_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_settings TO authenticated;
GRANT ALL ON public.api_settings TO service_role;
ALTER TABLE public.api_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own api settings" ON public.api_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own competitors" ON public.competitors FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ping_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ping_history TO authenticated;
GRANT ALL ON public.ping_history TO service_role;
ALTER TABLE public.ping_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pings" ON public.ping_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
