ALTER TABLE public.api_settings
  ADD COLUMN IF NOT EXISTS moz_token TEXT,
  ADD COLUMN IF NOT EXISTS majestic_key TEXT;