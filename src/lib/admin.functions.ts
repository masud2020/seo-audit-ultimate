import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev";

async function gatewayFetch(connectorSlug: string, path: string, apiKey: string | undefined) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return { ok: false, status: 0, error: "LOVABLE_API_KEY missing" };
  if (!apiKey) return { ok: false, status: 0, error: "Connector not linked to this project" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`${GATEWAY}/${connectorSlug}${path}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey },
      signal: ctrl.signal,
    });
    const body = await r.text();
    if (!r.ok) return { ok: false, status: r.status, error: body.slice(0, 300) };
    return { ok: true, status: r.status, sample: body.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  });

export const getConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: s } = await context.supabase
      .from("api_settings")
      .select("dataforseo_login, dataforseo_password, semrush_key, sender_email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const dataforseoConfigured = !!(s?.dataforseo_login && s?.dataforseo_password);

    return {
      gsc: { connected: !!process.env.GOOGLE_SEARCH_CONSOLE_API_KEY, envVar: "GOOGLE_SEARCH_CONSOLE_API_KEY" },
      semrush: { connected: !!process.env.SEMRUSH_API_KEY, envVar: "SEMRUSH_API_KEY", keyFallback: !!s?.semrush_key },
      brevo: { connected: !!process.env.BREVO_API_KEY, envVar: "BREVO_API_KEY", senderConfigured: !!s?.sender_email },
      dataforseo: { connected: dataforseoConfigured, envVar: null },
    };
  });

export const testConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string }) =>
    z.object({ key: z.enum(["gsc", "semrush", "brevo", "dataforseo"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const started = Date.now();
    let result: { ok: boolean; status: number; message: string; detail?: string };

    if (data.key === "gsc") {
      const r = await gatewayFetch("google_search_console", "/webmasters/v3/sites", process.env.GOOGLE_SEARCH_CONSOLE_API_KEY);
      result = { ok: r.ok, status: r.status, message: r.ok ? "GSC auth OK — sites list reachable." : "GSC test failed.", detail: r.ok ? undefined : r.error };
    } else if (data.key === "brevo") {
      const r = await gatewayFetch("brevo", "/v3/account", process.env.BREVO_API_KEY);
      result = { ok: r.ok, status: r.status, message: r.ok ? "Brevo account reachable." : "Brevo test failed.", detail: r.ok ? undefined : r.error };
    } else if (data.key === "semrush") {
      if (process.env.SEMRUSH_API_KEY) {
        const r = await gatewayFetch("semrush", "/?type=domain_ranks&domain=example.com&database=us", process.env.SEMRUSH_API_KEY);
        result = { ok: r.ok, status: r.status, message: r.ok ? "Semrush connector OK." : "Semrush connector test failed.", detail: r.ok ? undefined : r.error };
      } else {
        const { data: s } = await context.supabase.from("api_settings").select("semrush_key").eq("user_id", context.userId).maybeSingle();
        if (!s?.semrush_key) {
          result = { ok: false, status: 0, message: "Semrush is not configured.", detail: "Link the connector or add a fallback API key." };
        } else {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10_000);
          try {
            const r = await fetch(`https://api.semrush.com/?type=domain_ranks&domain=example.com&database=us&key=${encodeURIComponent(s.semrush_key)}`, { signal: ctrl.signal });
            const body = await r.text();
            const bad = !r.ok || body.startsWith("ERROR");
            result = { ok: !bad, status: r.status, message: bad ? "Semrush API key rejected." : "Semrush API key OK (fallback).", detail: bad ? body.slice(0, 200) : undefined };
          } catch (e) {
            result = { ok: false, status: 0, message: "Semrush request failed.", detail: e instanceof Error ? e.message : String(e) };
          } finally { clearTimeout(t); }
        }
      }
    } else {
      const { data: s } = await context.supabase.from("api_settings").select("dataforseo_login, dataforseo_password").eq("user_id", context.userId).maybeSingle();
      if (!s?.dataforseo_login || !s?.dataforseo_password) {
        result = { ok: false, status: 0, message: "DataForSEO credentials not set.", detail: "Enter login + password below." };
      } else {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10_000);
        try {
          const auth = Buffer.from(`${s.dataforseo_login}:${s.dataforseo_password}`).toString("base64");
          const r = await fetch("https://api.dataforseo.com/v3/appendix/user_data", { headers: { Authorization: `Basic ${auth}` }, signal: ctrl.signal });
          const body = await r.text();
          let msg = "DataForSEO auth OK.";
          let ok = r.ok;
          try {
            const parsed = JSON.parse(body);
            if (parsed?.status_code && parsed.status_code !== 20000) { ok = false; msg = `DataForSEO error ${parsed.status_code}: ${parsed.status_message}`; }
          } catch { /* non-json */ }
          result = { ok, status: r.status, message: ok ? msg : "DataForSEO test failed.", detail: ok ? undefined : body.slice(0, 300) };
        } catch (e) {
          result = { ok: false, status: 0, message: "DataForSEO request failed.", detail: e instanceof Error ? e.message : String(e) };
        } finally { clearTimeout(t); }
      }
    }

    return { ...result, latencyMs: Date.now() - started };
  });