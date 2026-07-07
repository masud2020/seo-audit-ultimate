
-- saved_links
CREATE TABLE public.saved_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_links TO authenticated;
GRANT ALL ON public.saved_links TO service_role;
ALTER TABLE public.saved_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved_links" ON public.saved_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX saved_links_user_created_idx ON public.saved_links (user_id, created_at DESC);

-- saved_sheets
CREATE TABLE public.saved_sheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_sheets TO authenticated;
GRANT ALL ON public.saved_sheets TO service_role;
ALTER TABLE public.saved_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved_sheets" ON public.saved_sheets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX saved_sheets_user_created_idx ON public.saved_sheets (user_id, created_at DESC);

-- shared touch trigger
CREATE OR REPLACE FUNCTION public.saved_items_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER saved_links_touch BEFORE UPDATE ON public.saved_links
  FOR EACH ROW EXECUTE FUNCTION public.saved_items_touch_updated_at();
CREATE TRIGGER saved_sheets_touch BEFORE UPDATE ON public.saved_sheets
  FOR EACH ROW EXECUTE FUNCTION public.saved_items_touch_updated_at();
