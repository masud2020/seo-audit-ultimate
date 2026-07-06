
-- Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Optional project link on existing tables
ALTER TABLE public.audits ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.keywords ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.site_crawls ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.competitors ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Keyword alerts
ALTER TABLE public.keywords ADD COLUMN alert_threshold integer NOT NULL DEFAULT 5;
ALTER TABLE public.keywords ADD COLUMN last_alerted_at timestamptz;

-- Scheduled audits
CREATE TABLE public.scheduled_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  cadence text NOT NULL DEFAULT 'weekly',
  email text,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_audits TO authenticated;
GRANT ALL ON public.scheduled_audits TO service_role;
ALTER TABLE public.scheduled_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scheduled" ON public.scheduled_audits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Content optimizations
CREATE TABLE public.content_optimizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  target_keyword text NOT NULL,
  title text,
  content text NOT NULL,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_optimizations TO authenticated;
GRANT ALL ON public.content_optimizations TO service_role;
ALTER TABLE public.content_optimizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own optimizations" ON public.content_optimizations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
