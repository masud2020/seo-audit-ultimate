// Whole-site audit engine: BFS-crawl same-origin pages, run per-page audit, aggregate.
import { runCrawl } from "./crawler.server";
import { runAudit, type AuditReport } from "./audit-engine.server";

export interface SitePageAudit {
  url: string;
  status: number;
  overall_score: number | null;
  duration_ms: number;
  section_scores: Record<string, number>;
  top_issues: { id: string; label: string; status: string; detail?: string }[];
  error?: string;
}

export interface SiteIssue { url: string; severity: "high" | "medium" | "low"; message: string; source: "crawl" | "audit" }

export interface SiteAuditSummary {
  start_url: string;
  pages_audited: number;
  pages_failed: number;
  overall_score: number;
  avg_by_section: Record<string, number>;
  issue_counts: { high: number; medium: number; low: number };
  top_problems: { message: string; count: number; severity: "high" | "medium" | "low" }[];
  finished_at: string;
}

async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function topIssuesFromReport(report: AuditReport): SitePageAudit["top_issues"] {
  const out: SitePageAudit["top_issues"] = [];
  for (const section of report.sections) {
    for (const c of section.checks) {
      if (c.status === "fail" || c.status === "warn") {
        out.push({ id: `${section.id}:${c.id}`, label: c.label, status: c.status, detail: c.detail });
      }
    }
  }
  return out.slice(0, 12);
}

export async function runSiteAudit(
  startUrl: string,
  maxPages: number,
  onProgress?: (n: number) => Promise<void> | void,
): Promise<{ pages: SitePageAudit[]; issues: SiteIssue[]; summary: SiteAuditSummary }> {
  // 1. Discovery via existing crawler
  const { pages: crawlPages, issues: crawlIssues } = await runCrawl(startUrl, maxPages);
  const urls = Array.from(new Set(crawlPages.map((p) => p.url))).slice(0, maxPages);

  // 2. Audit each URL (limited concurrency to stay within worker CPU/timeout budget).
  let done = 0;
  const audited = await pMap(urls, 4, async (url) => {
    const started = Date.now();
    try {
      const report = await runAudit(url);
      const section_scores: Record<string, number> = {};
      for (const s of report.sections) section_scores[s.id] = s.score;
      const page: SitePageAudit = {
        url,
        status: report.meta.status_code,
        overall_score: report.overall_score,
        duration_ms: Date.now() - started,
        section_scores,
        top_issues: topIssuesFromReport(report),
      };
      done++; if (onProgress) await onProgress(done);
      return page;
    } catch (e) {
      done++; if (onProgress) await onProgress(done);
      return {
        url, status: 0, overall_score: null, duration_ms: Date.now() - started,
        section_scores: {}, top_issues: [], error: e instanceof Error ? e.message : String(e),
      } satisfies SitePageAudit;
    }
  });

  // 3. Aggregate
  const good = audited.filter((p) => p.overall_score != null);
  const overall_score = good.length ? Math.round(good.reduce((a, p) => a + (p.overall_score ?? 0), 0) / good.length) : 0;

  const sectionTotals: Record<string, { sum: number; n: number }> = {};
  for (const p of good) {
    for (const [k, v] of Object.entries(p.section_scores)) {
      const t = (sectionTotals[k] ??= { sum: 0, n: 0 });
      t.sum += v; t.n++;
    }
  }
  const avg_by_section: Record<string, number> = {};
  for (const [k, t] of Object.entries(sectionTotals)) avg_by_section[k] = Math.round(t.sum / t.n);

  // Roll up per-page audit fails into site-wide issues + tally by problem.
  const auditIssues: SiteIssue[] = [];
  const problemCounts = new Map<string, { count: number; severity: "high" | "medium" | "low" }>();
  for (const p of audited) {
    if (p.error) {
      auditIssues.push({ url: p.url, severity: "high", message: `Audit error: ${p.error}`, source: "audit" });
      continue;
    }
    for (const issue of p.top_issues) {
      const severity = issue.status === "fail" ? "high" : "medium";
      const msg = issue.label + (issue.detail ? ` — ${issue.detail}` : "");
      auditIssues.push({ url: p.url, severity, message: msg, source: "audit" });
      const bucket = problemCounts.get(issue.label) ?? { count: 0, severity };
      bucket.count++;
      if (severity === "high") bucket.severity = "high";
      problemCounts.set(issue.label, bucket);
    }
  }

  const allIssues: SiteIssue[] = [
    ...crawlIssues.map((i) => ({ ...i, source: "crawl" as const })),
    ...auditIssues,
  ];
  const issue_counts = { high: 0, medium: 0, low: 0 };
  for (const i of allIssues) issue_counts[i.severity]++;

  const top_problems = Array.from(problemCounts.entries())
    .map(([message, v]) => ({ message, count: v.count, severity: v.severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    pages: audited,
    issues: allIssues,
    summary: {
      start_url: startUrl,
      pages_audited: audited.length,
      pages_failed: audited.filter((p) => p.error).length,
      overall_score,
      avg_by_section,
      issue_counts,
      top_problems,
      finished_at: new Date().toISOString(),
    },
  };
}