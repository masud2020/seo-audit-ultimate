CREATE TABLE public.site_crawls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  start_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pages_crawled integer NOT NULL DEFAULT 0,
  max_pages integer NOT NULL DEFAULT 25,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_crawls TO authenticated;
GRANT ALL ON public.site_crawls TO service_role;
ALTER TABLE public.site_crawls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own crawls" ON public.site_crawls FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);