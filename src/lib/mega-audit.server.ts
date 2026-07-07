// Mega Audit orchestrator — composes a single-page audit, a whole-site
// audit, site-wide external signals and (optionally) a competitor snapshot
// into one unified report. Progress is streamed to the DB via onProgress.
import { runAudit, type AuditReport } from "./audit-engine.server";
import { runSiteAudit, type SiteAuditSummary, type SitePageAudit, type SiteIssue } from "./site-audit.server";
import { psiSection, redirectChainSection, gscSection, gscSiteSection, semrushSection, aiVisibilitySection, siteSignals } from "./audit-signals.server";
import type { Section } from "./audit-engine.server";

export interface MegaAuditProgress { pct: number; message: string; }
export type MegaProgressCb = (p: MegaAuditProgress) => Promise<void> | void;

export interface MegaCompetitor {
  url: string;
  overall_score: number | null;
  page_report?: AuditReport | null;
  semrush?: Section | null;
  ai?: Section | null;
  error?: string;
}

export interface MegaAuditResult {
  target_url: string;
  competitor_url?: string | null;
  target_keyword?: string | null;
  finished_at: string;

  // Page-level report for the target URL (single-page audit + per-URL signals)
  page: AuditReport;

  // Whole-site audit result
  site: { summary: SiteAuditSummary; pages: SitePageAudit[]; issues: SiteIssue[] };

  // Site-wide external signals (PSI, GSC site, Semrush domain, AI, redirect)
  site_signals: Section[];

  // Competitor snapshot (optional)
  competitor?: MegaCompetitor | null;

  // Combined metrics
  mega_score: number;
  score_breakdown: { label: string; score: number; weight: number }[];
  priority_actions: { severity: "high" | "medium" | "low"; message: string; count?: number; source: string }[];
}

interface Options {
  targetUrl: string;
  competitorUrl?: string | null;
  targetKeyword?: string | null;
  maxPages: number;
  semrushKey?: string | null;
  psiKey?: string | null;
  verifiedSites: string[];
  onProgress?: MegaProgressCb;
}

async function pageReportWithSignals(url: string, opts: { semrushKey?: string | null; psiKey?: string | null; verifiedSites: string[] }): Promise<AuditReport> {
  const report = await runAudit(url);
  const [psi, redir, gsc, sr, ai] = await Promise.allSettled([
    psiSection(report.final_url, opts.psiKey ?? null),
    redirectChainSection(url),
    gscSection({ url: report.final_url, verifiedSites: opts.verifiedSites }),
    semrushSection({ url: report.final_url, apiKey: opts.semrushKey ?? null }),
    aiVisibilitySection(report.final_url),
  ]);
  for (const r of [psi, redir, gsc, sr, ai]) if (r.status === "fulfilled" && r.value) report.sections.push(r.value);
  report.overall_score = Math.round(report.sections.reduce((a, s) => a + s.score, 0) / Math.max(1, report.sections.length));
  return report;
}

async function competitorSnapshot(url: string, opts: { semrushKey?: string | null }): Promise<MegaCompetitor> {
  try {
    const report = await runAudit(url);
    const [sr, ai] = await Promise.allSettled([
      semrushSection({ url: report.final_url, apiKey: opts.semrushKey ?? null }),
      aiVisibilitySection(report.final_url),
    ]);
    const srSec = sr.status === "fulfilled" ? sr.value : null;
    const aiSec = ai.status === "fulfilled" ? ai.value : null;
    if (srSec) report.sections.push(srSec);
    if (aiSec) report.sections.push(aiSec);
    report.overall_score = Math.round(report.sections.reduce((a, s) => a + s.score, 0) / Math.max(1, report.sections.length));
    return { url, overall_score: report.overall_score, page_report: report, semrush: srSec, ai: aiSec };
  } catch (e) {
    return { url, overall_score: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runMegaAudit(opts: Options): Promise<MegaAuditResult> {
  const emit = async (pct: number, message: string) => { if (opts.onProgress) await opts.onProgress({ pct, message }); };

  await emit(5, "Starting mega audit…");

  // Kick off the biggest jobs in parallel: single-page + site + competitor.
  const pagePromise = pageReportWithSignals(opts.targetUrl, { semrushKey: opts.semrushKey, psiKey: opts.psiKey, verifiedSites: opts.verifiedSites });
  const sitePromise = runSiteAudit(
    opts.targetUrl,
    opts.maxPages,
    async (n) => { await emit(15 + Math.min(50, Math.round((n / opts.maxPages) * 50)), `Crawling & auditing pages (${n}/${opts.maxPages})…`); },
    { semrushKey: opts.semrushKey, psiKey: opts.psiKey, verifiedSites: opts.verifiedSites },
  );
  const compPromise = opts.competitorUrl
    ? competitorSnapshot(opts.competitorUrl, { semrushKey: opts.semrushKey })
    : Promise.resolve<MegaCompetitor | null>(null);

  await emit(10, "Auditing target URL & crawling site…");
  const [page, site, competitor] = await Promise.all([pagePromise, sitePromise, compPromise]);

  await emit(70, "Fetching site-wide external signals…");
  const site_signals: Section[] = site.summary.site_signals ?? await siteSignals({
    startUrl: opts.targetUrl, semrushKey: opts.semrushKey, psiKey: opts.psiKey, verifiedSites: opts.verifiedSites,
  }).catch(() => []);

  await emit(90, "Scoring & compiling report…");

  // Weighted mega score
  const parts: { label: string; score: number; weight: number }[] = [
    { label: "Homepage audit", score: page.overall_score, weight: 0.2 },
    { label: "Whole-site audit", score: site.summary.overall_score, weight: 0.4 },
    { label: "External signals", score: site_signals.length ? Math.round(site_signals.reduce((a, s) => a + s.score, 0) / site_signals.length) : 50, weight: 0.2 },
  ];
  if (competitor?.overall_score != null) {
    parts.push({ label: "Vs. competitor", score: Math.max(0, Math.min(100, 50 + (page.overall_score - competitor.overall_score))), weight: 0.2 });
  } else {
    // redistribute
    for (const p of parts) p.weight = p.weight / 0.8;
  }
  const mega_score = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0));

  // Priority actions: merge site top_problems + page fails + failing signal checks
  const actions: MegaAuditResult["priority_actions"] = [];
  for (const p of site.summary.top_problems ?? []) actions.push({ severity: p.severity, message: p.message, count: p.count, source: "site" });
  for (const s of page.sections) for (const c of s.checks) {
    if (c.status === "fail") actions.push({ severity: "high", message: `${s.title}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`, source: "page" });
    else if (c.status === "warn") actions.push({ severity: "medium", message: `${s.title}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`, source: "page" });
  }
  for (const s of site_signals) for (const c of s.checks) {
    if (c.status === "fail") actions.push({ severity: "high", message: `${s.title}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`, source: "signals" });
  }
  const rank = (a: { severity: string; count?: number }) => (a.severity === "high" ? 3 : a.severity === "medium" ? 2 : 1) * 1000 + (a.count ?? 0);
  actions.sort((a, b) => rank(b) - rank(a));

  await emit(100, "Complete");

  return {
    target_url: opts.targetUrl,
    competitor_url: opts.competitorUrl ?? null,
    target_keyword: opts.targetKeyword ?? null,
    finished_at: new Date().toISOString(),
    page,
    site,
    site_signals,
    competitor,
    mega_score,
    score_breakdown: parts,
    priority_actions: actions.slice(0, 30),
  };
}
