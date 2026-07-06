import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

function gscHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gsc = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovable || !gsc) throw new Error("Google Search Console connector is not linked");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gsc,
    "Content-Type": "application/json",
  };
}

function normalizeSite(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  return `${u.protocol}//${u.host}/`;
}

async function gscFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: { ...gscHeaders(), ...(init?.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Search Console [${res.status}]: ${text}`);
  return text ? JSON.parse(text) : {};
}

// -------- Server functions --------

export const listGscVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("gsc_verifications").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const requestGscToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { site_url: string }) =>
    z.object({ site_url: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const site_url = normalizeSite(data.site_url);
    const resp = await gscFetch("/siteVerification/v1/token", {
      method: "POST",
      body: JSON.stringify({ site: { identifier: site_url, type: "SITE" }, verificationMethod: "META" }),
    });
    const token = resp?.token as string;
    if (!token) throw new Error("No token returned from Google");
    const { data: row, error } = await context.supabase
      .from("gsc_verifications")
      .upsert({ user_id: context.userId, site_url, token, verified: false }, { onConflict: "user_id,site_url" })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const verifyGscSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error: rerr } = await context.supabase
      .from("gsc_verifications").select("*").eq("id", data.id).single();
    if (rerr || !row) throw new Error(rerr?.message ?? "Not found");

    // Step 1: verify ownership
    await gscFetch("/siteVerification/v1/webResource?verificationMethod=META", {
      method: "POST",
      body: JSON.stringify({ site: { identifier: row.site_url, type: "SITE" } }),
    });

    // Step 2: add site to Search Console (idempotent PUT)
    try {
      await gscFetch(`/webmasters/v3/sites/${encodeURIComponent(row.site_url)}`, { method: "PUT" });
    } catch (e) {
      // Ignore if already added
      console.warn("Add site warning:", (e as Error).message);
    }

    const { data: updated, error: uerr } = await context.supabase
      .from("gsc_verifications")
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq("id", data.id).select().single();
    if (uerr) throw new Error(uerr.message);
    return updated;
  });

export const deleteGscVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("gsc_verifications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public read for injecting meta tags into the root HTML
export const getPublicGscTokens = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [] as { token: string }[];
  const sb = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.from("gsc_verifications").select("token");
  return (data ?? []) as { token: string }[];
});