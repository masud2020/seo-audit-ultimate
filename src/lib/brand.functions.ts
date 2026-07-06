import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface BrandSettings {
  app_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  support_email: string | null;
  company_address: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  footer_text: string | null;
}

const emptyBrand: BrandSettings = {
  app_name: null, logo_url: null, favicon_url: null,
  primary_color: null, accent_color: null,
  support_email: null, company_address: null,
  privacy_url: null, terms_url: null, footer_text: null,
};

export const getBrand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandSettings> => {
    const { data, error } = await context.supabase
      .from("brand_settings")
      .select("app_name,logo_url,favicon_url,primary_color,accent_color,support_email,company_address,privacy_url,terms_url,footer_text")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BrandSettings | null) ?? emptyBrand;
  });

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use hex like #3b82f6").nullable().optional();
const url = z.string().url().nullable().optional();
const short = z.string().max(200).nullable().optional();
const long = z.string().max(2000).nullable().optional();

const brandSchema = z.object({
  app_name: short,
  logo_url: url,
  favicon_url: url,
  primary_color: hex,
  accent_color: hex,
  support_email: z.string().email().nullable().optional(),
  company_address: long,
  privacy_url: url,
  terms_url: url,
  footer_text: long,
});

function clean<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = v === "" ? null : v ?? null;
  }
  return out as T;
}

export const saveBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => brandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...clean(data), user_id: context.userId };
    const { error } = await context.supabase
      .from("brand_settings")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });