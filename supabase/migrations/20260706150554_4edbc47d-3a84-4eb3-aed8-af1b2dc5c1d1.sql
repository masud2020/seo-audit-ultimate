
-- Broken link checker
CREATE TABLE public.link_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  root_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  pages_scanned INT NOT NULL DEFAULT 0,
  links_total INT NOT NULL DEFAULT 0,
  links_broken INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_checks TO authenticated;
GRANT ALL ON public.link_checks TO service_role;
ALTER TABLE public.link_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_link_checks" ON public.link_checks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.link_check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.link_checks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status_code INT,
  status_bucket TEXT NOT NULL,
  is_external BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_check_items TO authenticated;
GRANT ALL ON public.link_check_items TO service_role;
ALTER TABLE public.link_check_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_link_check_items" ON public.link_check_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX link_check_items_check_id_idx ON public.link_check_items(check_id);

-- Backlink monitoring
CREATE TABLE public.monitored_backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_domain TEXT NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor TEXT,
  source_authority INT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status TEXT NOT NULL DEFAULT 'live',
  lost_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_url, target_url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitored_backlinks TO authenticated;
GRANT ALL ON public.monitored_backlinks TO service_role;
ALTER TABLE public.monitored_backlinks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_monitored_backlinks" ON public.monitored_backlinks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX monitored_backlinks_user_domain_idx ON public.monitored_backlinks(user_id, target_domain);

-- AI citation checker
CREATE TABLE public.ai_citation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_domain TEXT NOT NULL,
  prompts_count INT NOT NULL DEFAULT 0,
  models_count INT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_citation_runs TO authenticated;
GRANT ALL ON public.ai_citation_runs TO service_role;
ALTER TABLE public.ai_citation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ai_citation_runs" ON public.ai_citation_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_citation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ai_citation_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  cited BOOLEAN NOT NULL DEFAULT FALSE,
  mentions INT NOT NULL DEFAULT 0,
  snippet TEXT,
  response TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_citation_results TO authenticated;
GRANT ALL ON public.ai_citation_results TO service_role;
ALTER TABLE public.ai_citation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ai_citation_results" ON public.ai_citation_results FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_citation_results_run_id_idx ON public.ai_citation_results(run_id);

-- Blog sources (admin managed, all can read)
CREATE TABLE public.blog_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_sources TO authenticated;
GRANT ALL ON public.blog_sources TO service_role;
ALTER TABLE public.blog_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_sources_read" ON public.blog_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "blog_sources_admin_write" ON public.blog_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.blog_sources (name, url) VALUES
  ('Search Engine Journal', 'https://www.searchenginejournal.com/feed/'),
  ('Moz', 'https://moz.com/posts/rss/blog'),
  ('Ahrefs', 'https://ahrefs.com/blog/feed/'),
  ('Semrush', 'https://www.semrush.com/blog/feed/'),
  ('Majestic', 'https://blog.majestic.com/feed/'),
  ('Search Engine Land', 'https://searchengineland.com/feed'),
  ('Search Engine Roundtable', 'https://www.seroundtable.com/atom.xml')
ON CONFLICT (url) DO NOTHING;
