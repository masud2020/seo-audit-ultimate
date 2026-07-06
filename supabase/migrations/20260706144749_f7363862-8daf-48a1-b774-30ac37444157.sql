
ALTER TABLE public.api_settings
  ADD COLUMN IF NOT EXISTS dataforseo_login text,
  ADD COLUMN IF NOT EXISTS dataforseo_password text;
