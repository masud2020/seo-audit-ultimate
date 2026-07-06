CREATE TABLE public.disavow_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_domain TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_url TEXT,
  scope TEXT NOT NULL DEFAULT 'domain',
  reason TEXT,
  toxicity_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disavow_entries TO authenticated;
GRANT ALL ON public.disavow_entries TO service_role;
ALTER TABLE public.disavow_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own disavow entries" ON public.disavow_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX disavow_entries_user_target_idx ON public.disavow_entries (user_id, target_domain);

ALTER TABLE public.api_settings ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE public.api_settings ADD COLUMN IF NOT EXISTS sender_name TEXT;