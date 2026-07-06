
-- Unified run history for all six tools
CREATE TABLE public.tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tool TEXT NOT NULL,           -- 'broken_links' | 'backlink_monitor' | 'ai_detection' | 'ai_citations' | 'ai_potential' | 'seo_news'
  status TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'error' | 'running'
  label TEXT,                   -- human-readable summary (URL, domain, prompt count, etc.)
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  ref_table TEXT,               -- optional: 'link_checks' | 'ai_citation_runs' — foreign linkage
  ref_id UUID,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_runs TO authenticated;
GRANT ALL ON public.tool_runs TO service_role;
ALTER TABLE public.tool_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tool_runs" ON public.tool_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX tool_runs_user_created_idx ON public.tool_runs(user_id, created_at DESC);
CREATE INDEX tool_runs_user_tool_idx ON public.tool_runs(user_id, tool);
