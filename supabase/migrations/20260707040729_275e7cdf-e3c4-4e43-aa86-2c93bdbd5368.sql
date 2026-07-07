
REVOKE EXECUTE ON FUNCTION public.create_profile_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_touch_updated_at() FROM PUBLIC, anon, authenticated;
