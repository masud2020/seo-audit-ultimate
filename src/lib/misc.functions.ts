import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Discover URLs on a website by reading /robots.txt sitemap references and /sitemap.xml
// (recursively for sitemap indexes). Falls back to a shallow same-origin crawl.
export const discoverSiteUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; limit?: number }) =>
    z.object({ url: z.string().min(3).max(2048), limit: z.number().int().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const raw = data.url.trim();
    const start = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const origin = start.origin;
    const limit = data.limit ?? 100;
    const UA = "SEOAuditToolBot/1.0 (+https://lovable.app)";
    const safeFetch = async (u: string) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      try { return await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA } }); }
      finally { clearTimeout(t); }
    };
    const found = new Set<string>();
    const sitemapCandidates: string[] = [];

    // 1. robots.txt
    try {
      const r = await safeFetch(`${origin}/robots.txt`);
      if (r.ok) {
        const text = await r.text();
        for (const line of text.split(/\r?\n/)) {
          const m = /^\s*Sitemap:\s*(\S+)/i.exec(line);
          if (m) sitemapCandidates.push(m[1]);
        }
      }
    } catch { /* ignore */ }
    if (!sitemapCandidates.length) sitemapCandidates.push(`${origin}/sitemap.xml`);

    // 2. parse sitemaps (including indexes)
    const seenSitemaps = new Set<string>();
    const parseSitemap = async (sm: string, depth = 0): Promise<void> => {
      if (depth > 3 || seenSitemaps.has(sm) || found.size >= limit) return;
      seenSitemaps.add(sm);
      let res: Response;
      try { res = await safeFetch(sm); } catch { return; }
      if (!res.ok) return;
      const xml = await res.text();
      const isIndex = /<sitemapindex[\s>]/i.test(xml);
      const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
      if (isIndex) {
        for (const child of locs) { if (found.size >= limit) break; await parseSitemap(child, depth + 1); }
      } else {
        for (const loc of locs) {
          if (found.size >= limit) break;
          try {
            const u = new URL(loc);
            if (u.origin === origin) found.add(u.toString());
          } catch { /* skip invalid */ }
        }
      }
    };
    for (const sm of sitemapCandidates) { if (found.size >= limit) break; await parseSitemap(sm); }

    // 3. Fallback: shallow same-origin crawl from the homepage
    if (found.size === 0) {
      found.add(start.toString());
      try {
        const r = await safeFetch(origin);
        if (r.ok) {
          const html = await r.text();
          const hrefs = Array.from(html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)/gi)).map((m) => m[1]);
          for (const href of hrefs) {
            if (found.size >= limit) break;
            try {
              const u = new URL(href, origin);
              if (u.origin === origin) found.add(u.toString().split("#")[0]);
            } catch { /* skip */ }
          }
        }
      } catch { /* ignore */ }
    }

    const urls = Array.from(found).slice(0, limit);
    return { urls, source: seenSitemaps.size ? "sitemap" as const : "crawl" as const, count: urls.length };
  });

export const listKeywords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("keywords").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { keyword: string; target_url: string }) => z.object({ keyword: z.string().min(1).max(200), target_url: z.string().min(3).max(2048) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("keywords").insert({ user_id: context.userId, ...data }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("keywords").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: k, error } = await context.supabase.from("keywords").select("*").eq("id", data.id).single();
    if (error || !k) throw new Error("Keyword not found");
    const prev = k.current_position;
    // Try SerpAPI first (user key from api_settings), fallback to simulated position.
    const { data: settings } = await context.supabase.from("api_settings").select("serpapi_key").eq("user_id", context.userId).maybeSingle();
    const serpKey = (settings as { serpapi_key?: string } | null)?.serpapi_key;
    let next: number | null = null;
    let source: "serpapi" | "simulated" = "simulated";
    if (serpKey) {
      try {
        const params = new URLSearchParams({ engine: "google", q: k.keyword, num: "100", api_key: serpKey });
        const r = await fetch(`https://serpapi.com/search.json?${params}`);
        if (r.ok) {
          const j = await r.json() as { organic_results?: { position: number; link: string }[] };
          const targetHost = (() => { try { return new URL(k.target_url.startsWith("http") ? k.target_url : `https://${k.target_url}`).host.replace(/^www\./, ""); } catch { return k.target_url; } })();
          const hit = (j.organic_results ?? []).find(r => { try { return new URL(r.link).host.replace(/^www\./, "").includes(targetHost); } catch { return false; } });
          next = hit?.position ?? 101; // 101 = not found in top 100
          source = "serpapi";
        }
      } catch (e) { console.error("SerpAPI failed", e); }
    }
    if (next == null) next = Math.max(1, Math.min(100, Math.round((prev ?? 50) + (Math.random() * 10 - 5))));
    const history = (Array.isArray(k.history) ? (k.history as unknown as { position: number; checked_at: string }[]) : []).concat({ position: next, checked_at: new Date().toISOString() });
    const { error: e2 } = await context.supabase.from("keywords").update({
      previous_position: prev, current_position: next, history: history as never, updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { current_position: next, previous_position: prev, source };
  });

export const listChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("checklist_progress").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; checked: boolean }) => z.object({ key: z.string().min(1).max(200), checked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("checklist_progress").upsert({
      user_id: context.userId, item_key: data.key, checked: data.checked, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,item_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getApiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("api_settings").select("*").eq("user_id", context.userId).maybeSingle();
    return data ?? { provider: "lovable", groq_key: "", gemini_key: "", openai_key: "", perplexity_key: "", claude_key: "" };
  });

export const saveApiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, string>) => z.object({
    provider: z.string().max(50),
    groq_key: z.string().max(500).optional().default(""),
    gemini_key: z.string().max(500).optional().default(""),
    openai_key: z.string().max(500).optional().default(""),
    perplexity_key: z.string().max(500).optional().default(""),
    claude_key: z.string().max(500).optional().default(""),
    serpapi_key: z.string().max(500).optional().default(""),
    semrush_key: z.string().max(500).optional().default(""),
    sender_email: z.string().email().optional().or(z.literal("")),
    sender_name: z.string().max(200).optional().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("api_settings").upsert({
      user_id: context.userId, ...data, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PING_SERVICES = [
  { name: "Google Ping", url: "https://www.google.com/ping?sitemap=" },
  { name: "Bing Ping", url: "https://www.bing.com/ping?sitemap=" },
  { name: "IndexNow", url: "https://api.indexnow.org/indexnow?url=" },
];

export const pingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => z.object({ url: z.string().min(3).max(2048) }).parse(d))
  .handler(async ({ data, context }) => {
    const results = await Promise.all(PING_SERVICES.map(async (svc) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10_000);
        const r = await fetch(svc.url + encodeURIComponent(data.url), { signal: ctrl.signal });
        clearTimeout(t);
        return { service: svc.name, status: r.status, ok: r.ok };
      } catch (e) { return { service: svc.name, status: 0, ok: false, error: e instanceof Error ? e.message : String(e) }; }
    }));
    await context.supabase.from("ping_history").insert({ user_id: context.userId, url: data.url, results: results as never });
    return results;
  });

export const listPings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ping_history").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

// ========== Competitors ==========
export const listCompetitors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("competitors").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string; notes?: string }) => z.object({ domain: z.string().min(3).max(255), notes: z.string().max(2000).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("competitors").insert({ user_id: context.userId, domain: data.domain, notes: data.notes || null }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("competitors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ========== Backlinks (Semrush) ==========
export const getBacklinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string }) => z.object({ domain: z.string().min(3).max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase.from("api_settings").select("semrush_key").eq("user_id", context.userId).maybeSingle();
    const key = (s as { semrush_key?: string } | null)?.semrush_key;
    if (!key) return { configured: false as const };
    const target = data.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const url = `https://api.semrush.com/analytics/v1/?type=backlinks_overview&key=${encodeURIComponent(key)}&target=${encodeURIComponent(target)}&target_type=root_domain&export_columns=ascore,total,domains_num,urls_num,ips_num,follows_num,nofollows_num,texts_num,images_num,forms_num,frames_num`;
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok) throw new Error(`Semrush error ${r.status}: ${txt.slice(0, 200)}`);
    // CSV response: header line then value line, ; separated
    const [header, ...rows] = txt.trim().split(/\r?\n/);
    const cols = header.split(";");
    const parsed = rows.map(row => Object.fromEntries(row.split(";").map((v, i) => [cols[i], v])));
    return { configured: true as const, target, overview: parsed[0] ?? null, raw: txt };
  });

// ========== Site crawler ==========
export const startCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { start_url: string; max_pages?: number }) => z.object({ start_url: z.string().min(3).max(2048), max_pages: z.number().min(1).max(100).optional().default(25) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("site_crawls").insert({
      user_id: context.userId, start_url: data.start_url, max_pages: data.max_pages, status: "running",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const crawlId = row.id as string;
    try {
      const { runCrawl } = await import("./crawler.server");
      const report = await runCrawl(data.start_url, data.max_pages);
      await context.supabase.from("site_crawls").update({
        status: "complete", pages_crawled: report.pages.length,
        pages: report.pages as never, issues: report.issues as never,
        updated_at: new Date().toISOString(),
      }).eq("id", crawlId);
      return { id: crawlId };
    } catch (err) {
      await context.supabase.from("site_crawls").update({ status: "error", error: err instanceof Error ? err.message : String(err) }).eq("id", crawlId);
      throw err;
    }
  });

export const listCrawls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("site_crawls").select("id,start_url,status,pages_crawled,max_pages,created_at,error").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

export const getCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("site_crawls").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("site_crawls").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });