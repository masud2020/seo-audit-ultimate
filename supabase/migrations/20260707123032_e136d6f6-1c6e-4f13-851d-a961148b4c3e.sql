
CREATE TABLE public.llm_visibility_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('brand','citation','readiness')),
  target_domain TEXT,
  target_url TEXT,
  topic TEXT,
  prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  providers TEXT[] NOT NULL DEFAULT '{}',
  competitors TEXT[] NOT NULL DEFAULT '{}',
  score NUMERIC,
  hits INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.llm_visibility_runs TO authenticated;
GRANT ALL ON public.llm_visibility_runs TO service_role;
ALTER TABLE public.llm_visibility_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own llm visibility runs" ON public.llm_visibility_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX llm_visibility_runs_user_created ON public.llm_visibility_runs (user_id, created_at DESC);
