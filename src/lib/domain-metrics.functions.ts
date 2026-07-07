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
  spam_score: null;
  trust_flow: null;
  citation_flow: null;
  page_authority: null;
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
    const { data: apiRow } = await supabase.from("api_settings").select("semrush_key").eq("user_id", userId).maybeSingle();
    const semrushKey = (apiRow as { semrush_key?: string } | null)?.semrush_key || process.env.SEMRUSH_API_KEY || null;

    let authority_score: number | null = null;
    let backlinks_total: number | null = null;
    let referring_domains: number | null = null;
    let follow_pct: number | null = null;
    let organic_keywords: number | null = null;
    let organic_traffic: number | null = null;

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

    notes.push("Moz Spam Score, Page Authority, Majestic Trust Flow & Citation Flow are shown as N/A — they require Moz / Majestic API keys, which aren't connected. Authority Score (Semrush) is included as a widely used DA-equivalent.");

    const result: DomainMetricsResult = {
      domain, authority_score, backlinks_total, referring_domains, follow_pct,
      organic_keywords, organic_traffic,
      domain_age_years, created_date, updated_date, expires_date, registrar, nameservers,
      spam_score: null, trust_flow: null, citation_flow: null, page_authority: null,
      notes,
    };

    const run_id = await logToolRun({
      supabase, userId, tool: "domain_metrics", status: "success",
      label: `${domain} · AS ${authority_score ?? "—"} · ${domain_age_years ?? "?"}y`,
      input: data as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { ...result, run_id };
  });