DROP POLICY IF EXISTS "Anyone can view bkash settings" ON public.bkash_settings;
REVOKE SELECT ON public.bkash_settings FROM anon;
CREATE POLICY "Authenticated users can view bkash settings" ON public.bkash_settings
  FOR SELECT TO authenticated USING (true);