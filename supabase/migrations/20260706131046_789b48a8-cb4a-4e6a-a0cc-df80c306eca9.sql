ALTER TABLE public.api_settings
  ADD COLUMN IF NOT EXISTS serpapi_key text,
  ADD COLUMN IF NOT EXISTS semrush_key text;