-- Revoke EXECUTE from PUBLIC/anon/authenticated on internal SECURITY DEFINER trigger functions.
-- These are only invoked by triggers (running as owner), never through the Data API.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'gsc_update_updated_at',
        'site_audits_touch_updated_at',
        'mega_audits_touch_updated_at',
        'report_recommendations_touch_updated_at',
        'grant_admin_for_whitelisted_email',
        'profiles_touch_updated_at',
        'create_profile_for_new_user',
        'pricing_plans_touch_updated_at',
        'bkash_settings_touch_updated_at',
        'bkash_payments_touch_updated_at',
        'user_subscriptions_touch_updated_at'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- has_role stays callable: anon needs it for the public pricing_plans SELECT policy,
-- and authenticated users need it for admin RLS checks.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;