DROP POLICY IF EXISTS "Anyone can view active plans" ON public.pricing_plans;
CREATE POLICY "Anyone can view active plans"
  ON public.pricing_plans
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role))
  );