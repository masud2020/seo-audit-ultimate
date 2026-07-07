// Optional external SEO signal sections. Each function returns a full
// audit Section (or null when the signal has nothing to say). Wired into
// startAudit which appends them to the audit report after runAudit.
import { semrushCall, cleanDomain } from "./semrush.server";
import { callAi } from "./ai.server";
import type { Section, Check } from "./audit-engine.server";

const GSC_GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function score(checks: Check[]): number {
  const w = checks.filter((c) => c.status !== "info");
  if (!w.length) return 100;
  let total = 0;
  for (const c of w) total += c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0;
  return Math.round((total / w.length) * 100);
}

// ---------- 1. PageSpeed / Core Web Vitals ----------
// Uses Google's anonymous PSI endpoint (25 req/day/IP). Add PSI_API_KEY
// as a project secret to unlock the higher-quota authenticated tier.
export async function psiSection(url: string): Promise<Section | null> {
  const strategy = "mobile";
  const key = process.env.PSI_API_KEY;
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  params.append("category", "seo");
  params.append("category", "accessibility");
  params.append("category", "best-practices");
  if (key) params.set("key", key);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch(`${PSI_ENDPOINT}?${params}`, { signal: ctrl.signal });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 200);
      return {
        id: "psi", title: "Core Web Vitals (PageSpeed Insights)", score: 50,
        checks: [{ id: "psi-error", label: "PageSpeed Insights", status: "info", detail: `Could not fetch (HTTP ${r.status}). ${body}` }],
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await r.json();
    const lh = j.lighthouseResult;
    const cats = lh?.categories ?? {};
    const audits = lh?.audits ?? {};
    const cw = j.loadingExperience?.metrics ?? {};
    const num = (id: string) => (audits[id]?.numericValue ?? null) as number | null;
    const lcp = cw.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? num("largest-contentful-paint");
    const cls = cw.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ? cw.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : num("cumulative-layout-shift");
    const inp = cw.INTERACTION_TO_NEXT_PAINT?.percentile ?? num("interaction-to-next-paint");
    const fcp = cw.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? num("first-contentful-paint");
    const ttfb = cw.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile ?? num("server-response-time");
    const perfScore = cats.performance?.score != null ? Math.round(cats.performance.score * 100) : null;
    const seoScore = cats.seo?.score != null ? Math.round(cats.seo.score * 100) : null;
    const a11yScore = cats.accessibility?.score != null ? Math.round(cats.accessibility.score * 100) : null;
    const bpScore = cats["best-practices"]?.score != null ? Math.round(cats["best-practices"].score * 100) : null;

    const gradeMs = (v: number | null, good: number, poor: number): "pass" | "warn" | "fail" | "info" =>
      v == null ? "info" : v <= good ? "pass" : v <= poor ? "warn" : "fail";
    const gradeCls = (v: number | null): "pass" | "warn" | "fail" | "info" =>
      v == null ? "info" : v <= 0.1 ? "pass" : v <= 0.25 ? "warn" : "fail";
    const gradePct = (v: number | null): "pass" | "warn" | "fail" | "info" =>
      v == null ? "info" : v >= 90 ? "pass" : v >= 50 ? "warn" : "fail";

    const checks: Check[] = [
      { id: "psi-perf", label: "Lighthouse performance score", status: gradePct(perfScore), value: perfScore ?? "—", detail: "Field + lab data · mobile" },
      { id: "psi-lcp", label: "Largest Contentful Paint (LCP)", status: gradeMs(lcp, 2500, 4000), value: lcp != null ? `${Math.round(lcp)} ms` : "—", detail: "Good ≤ 2.5s · Poor > 4.0s" },
      { id: "psi-inp", label: "Interaction to Next Paint (INP)", status: gradeMs(inp, 200, 500), value: inp != null ? `${Math.round(inp)} ms` : "—", detail: "Good ≤ 200ms · Poor > 500ms" },
      { id: "psi-cls", label: "Cumulative Layout Shift (CLS)", status: gradeCls(cls), value: cls != null ? cls.toFixed(3) : "—", detail: "Good ≤ 0.1 · Poor > 0.25" },
      { id: "psi-fcp", label: "First Contentful Paint (FCP)", status: gradeMs(fcp, 1800, 3000), value: fcp != null ? `${Math.round(fcp)} ms` : "—" },
      { id: "psi-ttfb", label: "Time to First Byte (TTFB)", status: gradeMs(ttfb, 800, 1800), value: ttfb != null ? `${Math.round(ttfb)} ms` : "—" },
      { id: "psi-seo", label: "Lighthouse SEO score", status: gradePct(seoScore), value: seoScore ?? "—" },
      { id: "psi-a11y", label: "Lighthouse Accessibility score", status: gradePct(a11yScore), value: a11yScore ?? "—" },
      { id: "psi-bp", label: "Lighthouse Best Practices score", status: gradePct(bpScore), value: bpScore ?? "—" },
    ];
    return {
      id: "cwv", title: "Core Web Vitals & PageSpeed",
      checks, score: score(checks),
      data: { lighthouse: { performance: perfScore, seo: seoScore, accessibility: a11yScore, bestPractices: bpScore }, metrics: { lcp, inp, cls, fcp, ttfb }, source: cw && Object.keys(cw).length ? "field (CrUX)" : "lab (Lighthouse)" },
    };
  } catch (e) {
    return {
      id: "cwv", title: "Core Web Vitals & PageSpeed", score: 50,
      checks: [{ id: "cwv-timeout", label: "PageSpeed Insights", status: "info", detail: `Skipped: ${(e as Error).message}` }],
    };
  } finally { clearTimeout(t); }
}

// ---------- 2. Redirect chain ----------
export async function redirectChainSection(url: string): Promise<Section | null> {
  const chain: { url: string; status: number }[] = [];
  let current = url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    for (let i = 0; i < 6; i++) {
      const r = await fetch(current, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": "SEOAuditToolBot/1.0" } });
      chain.push({ url: current, status: r.status });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) break;
        current = new URL(loc, current).toString();
      } else break;
    }
    const hops = chain.length - 1;
    const httpToHttps = chain.some((c, i) => i > 0 && c.url.startsWith("https://") && chain[i - 1].url.startsWith("http://"));
    const checks: Check[] = [
      { id: "redirect-hops", label: "Redirect chain length", status: hops === 0 ? "pass" : hops === 1 ? "warn" : "fail", detail: `${hops} redirect${hops === 1 ? "" : "s"} before final URL`, value: hops },
      { id: "redirect-httpshops", label: "HTTP → HTTPS upgrade", status: httpToHttps ? "info" : "pass", detail: httpToHttps ? "Users hit HTTP first; consider HSTS preload" : "No HTTP → HTTPS redirect on this URL" },
    ];
    return { id: "redirects", title: "Redirect Chain", checks, score: score(checks), data: { chain } };
  } catch (e) {
    return { id: "redirects", title: "Redirect Chain", score: 50, checks: [{ id: "redirects-err", label: "Redirect trace", status: "info", detail: (e as Error).message }] };
  } finally { clearTimeout(t); }
}

// ---------- 3. Google Search Console (per URL) ----------
export async function gscSection(opts: { url: string; verifiedSites: string[] }): Promise<Section | null> {
  const lovable = process.env.LOVABLE_API_KEY;
  const gsc = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovable || !gsc) {
    return {
      id: "gsc", title: "Google Search Console", score: 50,
      checks: [{ id: "gsc-unlinked", label: "Google Search Console", status: "info", detail: "Not connected — connect GSC in Workspace Connectors to see impressions, clicks and URL inspection results." }],
    };
  }
  const origin = (() => { try { return new URL(opts.url).origin + "/"; } catch { return ""; } })();
  const siteUrl = opts.verifiedSites.find((s) => s === origin || s === origin.replace("://", "://www.")) ?? null;
  if (!siteUrl) {
    return {
      id: "gsc", title: "Google Search Console", score: 50,
      checks: [
        { id: "gsc-not-verified", label: "Search Console property", status: "warn", detail: `No verified property found for ${origin}. Verify this site in the GSC page inside the app to enable live search data.` },
      ],
    };
  }
  const headers = { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": gsc, "Content-Type": "application/json" };
  const end = new Date();
  const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [perfR, inspR] = await Promise.allSettled([
    fetch(`${GSC_GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST", headers,
      body: JSON.stringify({
        startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 10,
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: opts.url }] }],
      }),
    }),
    fetch(`${GSC_GATEWAY}/v1/urlInspection/index:inspect`, {
      method: "POST", headers,
      body: JSON.stringify({ inspectionUrl: opts.url, siteUrl }),
    }),
  ]);

  const checks: Check[] = [];
  let topQueries: Array<{ query: string; clicks: number; impressions: number; position: number; ctr: number }> = [];
  let totals = { clicks: 0, impressions: 0 };
  let inspectionRaw: unknown = null;

  if (perfR.status === "fulfilled" && perfR.value.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await perfR.value.json();
    const rows = (j.rows ?? []) as Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    topQueries = rows.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1), ctr: +(r.ctr * 100).toFixed(2) }));
    totals = rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });
    checks.push({ id: "gsc-imp", label: "Impressions (28d)", status: totals.impressions > 0 ? "pass" : "warn", value: totals.impressions, detail: totals.impressions > 0 ? "Google is showing this URL in search results" : "No impressions in the last 28 days" });
    checks.push({ id: "gsc-clicks", label: "Clicks (28d)", status: totals.clicks > 0 ? "pass" : "warn", value: totals.clicks });
    checks.push({ id: "gsc-topq", label: "Top-ranking queries", status: rows.length ? "info" : "warn", detail: rows.length ? rows.slice(0, 3).map((r) => `${r.keys[0]} (pos ${r.position.toFixed(1)})`).join(" · ") : "No queries in last 28 days" });
  } else {
    checks.push({ id: "gsc-perf-err", label: "Search performance", status: "info", detail: perfR.status === "rejected" ? perfR.reason?.message : `HTTP ${perfR.value.status}` });
  }

  if (inspR.status === "fulfilled" && inspR.value.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await inspR.value.json();
    inspectionRaw = j;
    const ir = j.inspectionResult ?? {};
    const idx = ir.indexStatusResult ?? {};
    const mob = ir.mobileUsabilityResult ?? {};
    const rich = ir.richResultsResult ?? {};
    checks.push({ id: "gsc-index", label: "Indexing state", status: idx.verdict === "PASS" ? "pass" : idx.verdict === "PARTIAL" ? "warn" : "fail", value: idx.coverageState || idx.verdict || "unknown", detail: idx.lastCrawlTime ? `Last crawled ${new Date(idx.lastCrawlTime).toLocaleDateString()}` : undefined });
    if (mob.verdict) checks.push({ id: "gsc-mobile", label: "Mobile usability", status: mob.verdict === "PASS" ? "pass" : "fail", value: mob.verdict });
    if (rich.verdict) checks.push({ id: "gsc-rich", label: "Rich results eligibility", status: rich.verdict === "PASS" ? "pass" : rich.verdict === "PARTIAL" ? "warn" : "info", value: rich.verdict, detail: (rich.detectedItems ?? []).map((d: { richResultType: string }) => d.richResultType).join(", ") });
  } else {
    checks.push({ id: "gsc-insp-err", label: "URL Inspection", status: "info", detail: inspR.status === "rejected" ? inspR.reason?.message : `HTTP ${inspR.value.status}` });
  }

  return { id: "gsc", title: "Google Search Console (live data)", checks, score: score(checks), data: { siteUrl, totals, topQueries, inspection: inspectionRaw } };
}

// ---------- 4. Semrush (per URL organic + domain backlinks) ----------
export async function semrushSection(opts: { url: string; apiKey?: string | null; database?: string }): Promise<Section | null> {
  const key = opts.apiKey || process.env.SEMRUSH_API_KEY;
  if (!key) {
    return {
      id: "semrush", title: "Semrush signals", score: 50,
      checks: [{ id: "semrush-unlinked", label: "Semrush", status: "info", detail: "Not connected — add a Semrush API key in Settings (or connect the Semrush connector) to see organic keywords, positions and backlink data." }],
    };
  }
  const database = opts.database ?? "us";
  const domain = cleanDomain(opts.url);
  const [urlRes, bkRes, ranksRes] = await Promise.allSettled([
    semrushCall({ type: "url_organic", url: opts.url, database, display_limit: "10", export_columns: "Ph,Po,Nq,Cp,Tr,Ur" }, key),
    semrushCall({ type: "backlinks_overview", target: domain, target_type: "root_domain", export_columns: "ascore,total,domains_num,ips_num,follows_num,nofollows_num" }, key),
    semrushCall({ type: "domain_ranks", domain, database, export_columns: "Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac" }, key),
  ]);

  const checks: Check[] = [];
  const data: Record<string, unknown> = {};

  if (urlRes.status === "fulfilled") {
    const rows = urlRes.value;
    data.urlKeywords = rows;
    checks.push({ id: "sr-url-kw", label: "Organic keywords ranking for this URL", status: rows.length ? "pass" : "warn", value: rows.length, detail: rows.length ? `Top: ${rows.slice(0, 3).map((r) => `${r.Ph} (#${r.Po})`).join(" · ")}` : "No keywords in top 100 for this URL yet" });
    const top10 = rows.filter((r) => Number(r.Po) <= 10).length;
    if (rows.length) checks.push({ id: "sr-url-top10", label: "Keywords in Google top 10", status: top10 > 0 ? "pass" : "warn", value: top10 });
  } else {
    checks.push({ id: "sr-url-err", label: "Semrush URL data", status: "info", detail: (urlRes.reason as Error)?.message?.slice(0, 200) ?? "unavailable" });
  }

  if (bkRes.status === "fulfilled" && bkRes.value.length) {
    const b = bkRes.value[0];
    data.backlinks = b;
    const ascore = Number(b.ascore || 0);
    checks.push({ id: "sr-authority", label: "Authority Score", status: ascore >= 40 ? "pass" : ascore >= 20 ? "warn" : "fail", value: ascore, detail: "0–100 · Semrush's overall domain quality score" });
    checks.push({ id: "sr-refdomains", label: "Referring domains", status: Number(b.domains_num) > 20 ? "pass" : Number(b.domains_num) > 0 ? "warn" : "fail", value: b.domains_num });
    checks.push({ id: "sr-backlinks", label: "Total backlinks", status: Number(b.total) > 0 ? "pass" : "warn", value: b.total });
  } else if (bkRes.status === "rejected") {
    checks.push({ id: "sr-bk-err", label: "Semrush backlinks", status: "info", detail: (bkRes.reason as Error)?.message?.slice(0, 200) });
  }

  if (ranksRes.status === "fulfilled" && ranksRes.value.length) {
    const r = ranksRes.value[0];
    data.domainRanks = r;
    checks.push({ id: "sr-org-kw", label: "Domain organic keywords", status: Number(r.Or) > 0 ? "pass" : "warn", value: r.Or });
    checks.push({ id: "sr-org-tr", label: "Estimated monthly organic traffic", status: Number(r.Ot) > 0 ? "pass" : "warn", value: r.Ot });
  }

  return { id: "semrush", title: "Semrush signals", checks, score: score(checks), data };
}

// ---------- 5. AI visibility (does an LLM know this site?) ----------
export async function aiVisibilitySection(url: string): Promise<Section | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const domain = cleanDomain(url);
  const models = [
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  ];
  const prompt = `Have you heard of the website ${domain}? In one short sentence, describe what it offers. If you are not familiar with it or cannot describe it confidently, reply with only: UNKNOWN`;
  const results = await Promise.allSettled(models.map(async (m) => {
    const raw = await callAi({ model: m.id, user: prompt, temperature: 0.2 });
    const clean = raw.trim();
    const known = !/^unknown\b/i.test(clean) && !/not familiar|don'?t (?:know|have)|no (?:information|knowledge)/i.test(clean);
    return { model: m.label, known, text: clean.slice(0, 260) };
  }));
  const parsed = results.map((r, i) => r.status === "fulfilled" ? r.value : { model: models[i].label, known: false, text: `error: ${(r.reason as Error)?.message ?? "unavailable"}` });
  const knownCount = parsed.filter((p) => p.known).length;
  const checks: Check[] = [
    { id: "ai-vis-overall", label: "AI models aware of this site", status: knownCount === parsed.length ? "pass" : knownCount > 0 ? "warn" : "fail", value: `${knownCount}/${parsed.length}`, detail: knownCount === 0 ? "No tested model recognizes this domain. Build citations and mentions on reputable sources to become visible in AI search." : undefined },
    ...parsed.map((p): Check => ({ id: `ai-vis-${p.model.replace(/\s+/g, "-")}`, label: p.model, status: p.known ? "pass" : "warn", detail: p.text })),
  ];
  return { id: "ai-visibility", title: "AI Search Visibility", checks, score: score(checks), data: { models: parsed, prompt } };
}

// ---------- 6. Site-level GSC (28d totals + top queries, no per-URL filter) ----------
export async function gscSiteSection(opts: { startUrl: string; verifiedSites: string[] }): Promise<Section | null> {
  const lovable = process.env.LOVABLE_API_KEY;
  const gsc = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovable || !gsc) {
    return {
      id: "gsc-site", title: "Google Search Console (site)", score: 50,
      checks: [{ id: "gsc-site-unlinked", label: "Google Search Console", status: "info", detail: "Not connected — connect GSC in Workspace Connectors to see impressions, clicks and top queries across your whole site." }],
    };
  }
  const origin = (() => { try { return new URL(opts.startUrl).origin + "/"; } catch { return ""; } })();
  const siteUrl = opts.verifiedSites.find((s) => s === origin || s === origin.replace("://", "://www.")) ?? null;
  if (!siteUrl) {
    return {
      id: "gsc-site", title: "Google Search Console (site)", score: 50,
      checks: [{ id: "gsc-site-not-verified", label: "Search Console property", status: "warn", detail: `No verified property found for ${origin}. Verify this site in the GSC page inside the app to enable live search data.` }],
    };
  }
  const headers = { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": gsc, "Content-Type": "application/json" };
  const end = new Date();
  const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const endpoint = `${GSC_GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const [totalsR, queryR, pageR] = await Promise.allSettled([
    fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), rowLimit: 1 }) }),
    fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 10 }) }),
    fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["page"], rowLimit: 10 }) }),
  ]);

  const checks: Check[] = [];
  const data: Record<string, unknown> = { siteUrl };

  if (totalsR.status === "fulfilled" && totalsR.value.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await totalsR.value.json();
    const row = (j.rows ?? [])[0];
    const clicks = row?.clicks ?? 0;
    const imps = row?.impressions ?? 0;
    const ctr = row?.ctr != null ? +(row.ctr * 100).toFixed(2) : 0;
    const pos = row?.position != null ? +row.position.toFixed(1) : null;
    data.totals = { clicks, impressions: imps, ctr, position: pos };
    checks.push({ id: "gsc-site-imp", label: "Site impressions (28d)", status: imps > 0 ? "pass" : "warn", value: imps });
    checks.push({ id: "gsc-site-clicks", label: "Site clicks (28d)", status: clicks > 0 ? "pass" : "warn", value: clicks });
    checks.push({ id: "gsc-site-ctr", label: "Average CTR", status: ctr >= 2 ? "pass" : ctr > 0 ? "warn" : "info", value: `${ctr}%` });
    if (pos != null) checks.push({ id: "gsc-site-pos", label: "Average position", status: pos <= 10 ? "pass" : pos <= 20 ? "warn" : "fail", value: pos });
  } else {
    checks.push({ id: "gsc-site-totals-err", label: "Search performance", status: "info", detail: totalsR.status === "rejected" ? (totalsR.reason as Error)?.message : `HTTP ${totalsR.value.status}` });
  }

  if (queryR.status === "fulfilled" && queryR.value.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await queryR.value.json();
    const rows = (j.rows ?? []) as Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    const topQ = rows.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1), ctr: +(r.ctr * 100).toFixed(2) }));
    data.topQueries = topQ;
    checks.push({ id: "gsc-site-topq", label: "Top search queries (28d)", status: topQ.length ? "info" : "warn", detail: topQ.length ? topQ.slice(0, 3).map((q) => `${q.query} (pos ${q.position})`).join(" · ") : "No queries in last 28 days" });
  }
  if (pageR.status === "fulfilled" && pageR.value.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await pageR.value.json();
    const rows = (j.rows ?? []) as Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    const topP = rows.map((r) => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1), ctr: +(r.ctr * 100).toFixed(2) }));
    data.topPages = topP;
    checks.push({ id: "gsc-site-topp", label: "Top pages by impressions", status: topP.length ? "info" : "warn", detail: topP.length ? `${topP.length} pages with search impressions in last 28 days` : "No pages ranking yet" });
  }

  return { id: "gsc-site", title: "Google Search Console (site, 28d)", checks, score: score(checks), data };
}

// ---------- 7. Site-wide signals bundle (used by whole-site audit) ----------
export async function siteSignals(opts: { startUrl: string; semrushKey?: string | null; verifiedSites: string[] }): Promise<Section[]> {
  const [psi, redir, gsc, sr, ai] = await Promise.allSettled([
    psiSection(opts.startUrl),
    redirectChainSection(opts.startUrl),
    gscSiteSection({ startUrl: opts.startUrl, verifiedSites: opts.verifiedSites }),
    semrushSection({ url: opts.startUrl, apiKey: opts.semrushKey ?? null }),
    aiVisibilitySection(opts.startUrl),
  ]);
  const out: Section[] = [];
  for (const r of [psi, redir, gsc, sr, ai]) if (r.status === "fulfilled" && r.value) out.push(r.value);
  return out;
}
