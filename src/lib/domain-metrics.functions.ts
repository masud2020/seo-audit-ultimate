import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

type Ctx = { supabase: any; userId: string };

const schema = z.object({ domain: z.string().min(3).max(253) });

export type DomainMetricsResult = {
  domain: string;
  authority_score: number | null;
  backlinks_total: number | null;
  referring_domains: number | null;
  follow_pct: number | null;
  organic_keywords: number | null;
  organic_traffic: number | null;
  domain_age_years: number | null;
  created_date: string | null;
  updated_date: string | null;
  expires_date: string | null;
  registrar: string | null;
  nameservers: string[];
  spam_score: number | null;
  trust_flow: number | null;
  citation_flow: number | null;
  page_authority: number | null;
  domain_authority: number | null;
  notes: string[];
  run_id?: string | null;
};

async function rdapLookup(domain: string) {
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as any;
  } catch { return null; }
}

function pickEvent(events: any[] | undefined, action: string): string | null {
  if (!Array.isArray(events)) return null;
  const ev = events.find((e) => e?.eventAction === action);
  return ev?.eventDate ?? null;
}

async function fetchMoz(domain: string, token: string) {
  // Moz Links API v2 (JSON-RPC 2.0). Auth: Bearer token.
  // Docs: https://moz.com/help/links-api
  const r = await fetch("https://api.moz.com/jsonrpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "domain-metrics",
      method: "data.site.metrics.fetch",
      params: { data: { site_query: { query: domain, scope: "domain" } } },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json()) as { error?: { message?: string }; result?: { site_metrics?: Record<string, number> } };
  if (!r.ok || j.error) throw new Error(j.error?.message || `Moz error ${r.status}`);
  const sm = j.result?.site_metrics ?? {};
  return {
    domain_authority: typeof sm.domain_authority === "number" ? sm.domain_authority : null,
    page_authority: typeof sm.page_authority === "number" ? sm.page_authority : null,
    spam_score: typeof sm.spam_score === "number" ? sm.spam_score : null,
  };
}

async function fetchMajestic(domain: string, key: string) {
  // Majestic API: GET /api/json?cmd=GetIndexItemInfo&app_api_key=...&items=1&item0=<domain>
  // Docs: https://developer-support.majestic.com/api/commands/get-index-item-info.shtml
  const params = new URLSearchParams({
    app_api_key: key, cmd: "GetIndexItemInfo", items: "1", item0: domain, datasource: "fresh",
  });
  const r = await fetch(`https://api.majestic.com/api/json?${params}`, { signal: AbortSignal.timeout(15_000) });
  const j = (await r.json()) as {
    Code?: string; ErrorMessage?: string;
    DataTables?: { Results?: { Data?: Array<Record<string, unknown>> } };
  };
  if (j.Code && j.Code !== "OK") throw new Error(j.ErrorMessage || `Majestic error ${j.Code}`);
  const row = j.DataTables?.Results?.Data?.[0] ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : v != null && !isNaN(Number(v)) ? Number(v) : null);
  return {
    trust_flow: num(row.TrustFlow),
    citation_flow: num(row.CitationFlow),
  };
}

export const runDomainMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const { semrushCall, cleanDomain } = await import("./semrush.server");
    const domain = cleanDomain(data.domain);
    const notes: string[] = [];

    // Semrush key
    const { data: apiRow } = await supabase.from("api_settings").select("semrush_key,moz_token,majestic_key").eq("user_id", userId).maybeSingle();
    const row = (apiRow ?? {}) as { semrush_key?: string; moz_token?: string; majestic_key?: string };
    const semrushKey = row.semrush_key || process.env.SEMRUSH_API_KEY || null;
    const mozToken = row.moz_token || process.env.MOZ_API_TOKEN || null;
    const majesticKey = row.majestic_key || process.env.MAJESTIC_API_KEY || null;

    let authority_score: number | null = null;
    let backlinks_total: number | null = null;
    let referring_domains: number | null = null;
    let follow_pct: number | null = null;
    let organic_keywords: number | null = null;
    let organic_traffic: number | null = null;
    let domain_authority: number | null = null;
    let page_authority: number | null = null;
    let spam_score: number | null = null;
    let trust_flow: number | null = null;
    let citation_flow: number | null = null;

    if (!semrushKey) {
      notes.push("Semrush API key not set — Authority Score and backlink counts unavailable. Add it in API Settings.");
    } else {
      try {
        const bl = await semrushCall({
          type: "backlinks_overview",
          target: domain,
          target_type: "root_domain",
          export_columns: "ascore,total,domains_num,follows_num,nofollows_num",
        }, semrushKey);
        const row = bl[0];
        if (row) {
          authority_score = Number(row.ascore) || null;
          backlinks_total = Number(row.total) || 0;
          referring_domains = Number(row.domains_num) || 0;
          const f = Number(row.follows_num) || 0;
          const nf = Number(row.nofollows_num) || 0;
          follow_pct = f + nf > 0 ? Math.round((f / (f + nf)) * 100) : null;
        }
      } catch (e) { notes.push(`Backlink data: ${e instanceof Error ? e.message : String(e)}`); }

      try {
        const dr = await semrushCall({
          type: "domain_ranks",
          domain,
          database: "us",
          export_columns: "Db,Dn,Rk,Or,Ot,Oc",
        }, semrushKey);
        const row = dr[0];
        if (row) {
          organic_keywords = Number(row.Or) || 0;
          organic_traffic = Number(row.Ot) || 0;
        }
      } catch (e) { notes.push(`Organic data: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // Moz (PA / DA / Spam Score)
    if (!mozToken) {
      notes.push("Moz API token not set — Page Authority and Spam Score unavailable. Add it in Admin Settings → API Keys.");
    } else {
      try {
        const m = await fetchMoz(domain, mozToken);
        domain_authority = m.domain_authority;
        page_authority = m.page_authority;
        spam_score = m.spam_score;
      } catch (e) { notes.push(`Moz: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // Majestic (TF / CF)
    if (!majesticKey) {
      notes.push("Majestic API key not set — Trust Flow and Citation Flow unavailable. Add it in Admin Settings → API Keys.");
    } else {
      try {
        const mj = await fetchMajestic(domain, majesticKey);
        trust_flow = mj.trust_flow;
        citation_flow = mj.citation_flow;
      } catch (e) { notes.push(`Majestic: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // Domain age (RDAP)
    let created_date: string | null = null;
    let updated_date: string | null = null;
    let expires_date: string | null = null;
    let registrar: string | null = null;
    let nameservers: string[] = [];
    let domain_age_years: number | null = null;
    const rdap = await rdapLookup(domain);
    if (rdap) {
      created_date = pickEvent(rdap.events, "registration");
      updated_date = pickEvent(rdap.events, "last changed") ?? pickEvent(rdap.events, "last update of RDAP database");
      expires_date = pickEvent(rdap.events, "expiration");
      const reg = Array.isArray(rdap.entities) ? rdap.entities.find((e: any) => Array.isArray(e.roles) && e.roles.includes("registrar")) : null;
      if (reg?.vcardArray?.[1]) {
        const fn = reg.vcardArray[1].find((v: any[]) => v?.[0] === "fn");
        registrar = fn?.[3] ?? null;
      }
      nameservers = Array.isArray(rdap.nameservers) ? rdap.nameservers.map((n: any) => String(n.ldhName || n.unicodeName || "")).filter(Boolean) : [];
      if (created_date) {
        const ms = Date.now() - new Date(created_date).getTime();
        if (ms > 0) domain_age_years = Math.round((ms / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
      }
    } else {
      notes.push("Whois/RDAP lookup unavailable for this TLD.");
    }

    const result: DomainMetricsResult = {
      domain, authority_score, backlinks_total, referring_domains, follow_pct,
      organic_keywords, organic_traffic,
      domain_age_years, created_date, updated_date, expires_date, registrar, nameservers,
      spam_score, trust_flow, citation_flow, page_authority, domain_authority,
      notes,
    };

    const run_id = await logToolRun({
      supabase, userId, tool: "domain_metrics", status: "success",
      label: `${domain} · DA ${domain_authority ?? authority_score ?? "—"} · PA ${page_authority ?? "—"} · TF ${trust_flow ?? "—"}`,
      input: data as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { ...result, run_id };
  });

export type TestKeysResult = {
  moz: { configured: boolean; ok: boolean; message: string; latencyMs: number };
  majestic: { configured: boolean; ok: boolean; message: string; latencyMs: number };
};

export const testDomainMetricsKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: apiRow } = await supabase
      .from("api_settings").select("moz_token,majestic_key").eq("user_id", userId).maybeSingle();
    const row = (apiRow ?? {}) as { moz_token?: string; majestic_key?: string };
    const mozToken = row.moz_token || process.env.MOZ_API_TOKEN || null;
    const majesticKey = row.majestic_key || process.env.MAJESTIC_API_KEY || null;
    const probeDomain = "moz.com";

    const out: TestKeysResult = {
      moz: { configured: !!mozToken, ok: false, message: "Not configured", latencyMs: 0 },
      majestic: { configured: !!majesticKey, ok: false, message: "Not configured", latencyMs: 0 },
    };

    if (mozToken) {
      const t0 = Date.now();
      try {
        const m = await fetchMoz(probeDomain, mozToken);
        out.moz = {
          configured: true, ok: true, latencyMs: Date.now() - t0,
          message: `Connected · DA ${m.domain_authority ?? "—"} · PA ${m.page_authority ?? "—"} · Spam ${m.spam_score ?? "—"}`,
        };
      } catch (e) {
        out.moz = { configured: true, ok: false, latencyMs: Date.now() - t0, message: e instanceof Error ? e.message : "Moz test failed" };
      }
    }

    if (majesticKey) {
      const t0 = Date.now();
      try {
        const mj = await fetchMajestic(probeDomain, majesticKey);
        out.majestic = {
          configured: true, ok: true, latencyMs: Date.now() - t0,
          message: `Connected · TF ${mj.trust_flow ?? "—"} · CF ${mj.citation_flow ?? "—"}`,
        };
      } catch (e) {
        out.majestic = { configured: true, ok: false, latencyMs: Date.now() - t0, message: e instanceof Error ? e.message : "Majestic test failed" };
      }
    }

    return out;
  });