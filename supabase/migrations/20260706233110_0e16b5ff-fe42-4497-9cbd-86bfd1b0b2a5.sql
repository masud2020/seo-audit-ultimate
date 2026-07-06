-- 1. Restrict gsc_verifications: drop public SELECT, add owner-only SELECT
DROP POLICY IF EXISTS "Public can read tokens for meta tag embedding" ON public.gsc_verifications;

CREATE POLICY "Owners can read their verifications"
  ON public.gsc_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE SELECT ON public.gsc_verifications FROM anon;

-- 2. Revoke EXECUTE on SECURITY DEFINER helpers from client-callable roles.
--    RLS policies and triggers continue to work because SECURITY DEFINER
--    functions run as their owner and triggers bypass EXECUTE checks.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gsc_update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.site_audits_touch_updated_at() FROM PUBLIC, anon, authenticated;

-- 3. Reschedule the cron job with a shared-secret header so the /api/public
--    endpoint can verify the caller in code.
SELECT cron.unschedule('run-scheduled-audits');
SELECT cron.schedule(
  'run-scheduled-audits',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b12e4287-881c-4d9a-85fe-22a97c824700.lovable.app/api/public/hooks/run-scheduled-audits',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TEf1obBTJmmonhCO6G0173S4vObEZ10iEC1I108ZJTsd1S7O"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);