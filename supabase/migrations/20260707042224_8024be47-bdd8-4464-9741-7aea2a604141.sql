
-- =========================================================
-- pricing_plans
-- =========================================================
CREATE TABLE public.pricing_plans (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_bdt INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BDT',
  description TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta_label TEXT NOT NULL DEFAULT 'Get started',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pricing_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_plans TO authenticated;
GRANT ALL ON public.pricing_plans TO service_role;

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" ON public.pricing_plans
  FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert plans" ON public.pricing_plans
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update plans" ON public.pricing_plans
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete plans" ON public.pricing_plans
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.pricing_plans_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.pricing_plans_touch_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pricing_plans_updated_at BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.pricing_plans_touch_updated_at();

-- =========================================================
-- bkash_settings (singleton)
-- =========================================================
CREATE TABLE public.bkash_settings (
  id INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  merchant_number TEXT,
  account_type TEXT NOT NULL DEFAULT 'personal',
  instructions TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bkash_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.bkash_settings TO authenticated;
GRANT ALL ON public.bkash_settings TO service_role;

ALTER TABLE public.bkash_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bkash settings" ON public.bkash_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert bkash settings" ON public.bkash_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update bkash settings" ON public.bkash_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.bkash_settings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.bkash_settings_touch_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bkash_settings_updated_at BEFORE UPDATE ON public.bkash_settings
  FOR EACH ROW EXECUTE FUNCTION public.bkash_settings_touch_updated_at();

INSERT INTO public.bkash_settings (id, merchant_number, account_type, instructions)
VALUES (1, '01XXXXXXXXX', 'personal',
'Send Money via bKash to the number above. Use the exact amount shown for your plan. After sending, copy the Transaction ID (TrxID) from your bKash confirmation SMS and submit it on the checkout page along with the sender bKash number. Your plan is activated after admin verification (usually within a few hours).');

-- =========================================================
-- bkash_payments
-- =========================================================
CREATE TABLE public.bkash_payments (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  sender_msisdn TEXT NOT NULL,
  amount_bdt INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transaction_id)
);

CREATE INDEX bkash_payments_user_idx ON public.bkash_payments (user_id, created_at DESC);
CREATE INDEX bkash_payments_status_idx ON public.bkash_payments (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bkash_payments TO authenticated;
GRANT ALL ON public.bkash_payments TO service_role;

ALTER TABLE public.bkash_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments" ON public.bkash_payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all payments" ON public.bkash_payments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own payments" ON public.bkash_payments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins can update payments" ON public.bkash_payments
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.bkash_payments_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.bkash_payments_touch_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bkash_payments_updated_at BEFORE UPDATE ON public.bkash_payments
  FOR EACH ROW EXECUTE FUNCTION public.bkash_payments_touch_updated_at();

-- =========================================================
-- user_subscriptions
-- =========================================================
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','canceled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'bkash',
  source_payment_id UUID REFERENCES public.bkash_payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_slug, source_payment_id)
);

CREATE INDEX user_subscriptions_user_idx ON public.user_subscriptions (user_id, status, expires_at DESC);

GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all subscriptions" ON public.user_subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.user_subscriptions_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.user_subscriptions_touch_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.user_subscriptions_touch_updated_at();

-- =========================================================
-- Seed default plans
-- =========================================================
INSERT INTO public.pricing_plans (slug, name, price_bdt, description, features, cta_label, is_featured, sort_order)
VALUES
  ('free', 'Free', 0,
   'Try the full audit engine on a single site.',
   '["1 project","5 audits / month","Keyword tracker (10 keywords)","Community support"]'::jsonb,
   'Start free', false, 1),
  ('pro', 'Pro', 1500,
   'For solo SEOs and small agencies growing multiple sites.',
   '["10 projects","Unlimited audits","Keyword tracker (500 keywords)","AI content optimizer","Backlink monitor","Email support"]'::jsonb,
   'Upgrade to Pro', true, 2),
  ('business', 'Business', 4500,
   'For agencies running audits across many client sites.',
   '["Unlimited projects","Unlimited audits","Keyword tracker (5000 keywords)","AI content + citations","White-label PDF reports","Scheduled audits","Priority support"]'::jsonb,
   'Go Business', false, 3);
