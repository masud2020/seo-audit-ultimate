// Shared report primitives used by every report page (single-URL audit,
// whole-site audit, and all tool reports). Pure functions — no server
// imports — so they can be used in server-only helpers, server fns, and
// client components alike.

export type Status = "pass" | "warn" | "fail" | "info";
export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  label: string;
  status: Status;
  severity?: Severity;
  detail?: string;
  value?: string | number | null;
}

export interface Section {
  id: string;
  title: string;
  category: Category;
  score?: number;
  findings: Finding[];
}

export type Category =
  | "Technical"
  | "On-page"
  | "Content"
  | "Performance"
  | "Accessibility"
  | "Security"
  | "Schema"
  | "Backlinks"
  | "Other";

export interface NormalizedReport {
  id: string;
  type: "audit" | "site_audit" | "tool_run";
  tool?: string;             // tool_runs only
  title: string;             // URL, host, or subject
  subtitle?: string;
  finished_at?: string;
  sections: Section[];
}

// ---------------------------------------------------------------------------
// Section id → category map (audit engine sections)
// ---------------------------------------------------------------------------
const SECTION_CATEGORY: Record<string, Category> = {
  meta: "On-page",
  onpage: "On-page",
  content: "Content",
  links: "On-page",
  broken: "Technical",
  images: "Accessibility",
  robots: "Technical",
  sitemap: "Technical",
  structured: "Schema",
  ssl: "Security",
  performance: "Performance",
  favicon: "Technical",
  notfound: "Technical",
  mobile: "Technical",
  accessibility: "Accessibility",
  i18n: "On-page",
  security: "Security",
};
export function categoryFor(sectionId: string): Category {
  return SECTION_CATEGORY[sectionId] ?? "Other";
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------
type AnyRec = Record<string, unknown>;

/** Adapts an /audit/$id row to a NormalizedReport. */
export function normalizeAudit(row: AnyRec): NormalizedReport {
  const report = (row.sections ?? {}) as AnyRec;
  const sections = Array.isArray(report.sections) ? (report.sections as AnyRec[]) : [];
  return {
    id: String(row.id ?? ""),
    type: "audit",
    title: String(report.url ?? row.url ?? ""),
    subtitle: (report.final_url as string) ?? undefined,
    finished_at: (report.fetched_at as string) ?? (row.finished_at as string),
    sections: sections.map((s) => ({
      id: String(s.id ?? ""),
      title: String(s.title ?? s.id ?? ""),
      category: categoryFor(String(s.id ?? "")),
      score: typeof s.score === "number" ? s.score : undefined,
      findings: Array.isArray(s.checks)
        ? (s.checks as AnyRec[]).map((c) => ({
            id: String(c.id ?? ""),
            label: String(c.label ?? c.id ?? ""),
            status: (c.status as Status) ?? "info",
            detail: (c.detail as string) ?? undefined,
            value: (c.value as string | number | null) ?? undefined,
          }))
        : [],
    })),
  };
}

/** Adapts a /site-audit/$id row to a NormalizedReport. */
export function normalizeSiteAudit(row: AnyRec): NormalizedReport {
  const summary = (row.summary ?? {}) as AnyRec;
  const issueCounts = (summary.issue_counts ?? {}) as AnyRec;
  const bySection = (summary.avg_by_section ?? {}) as Record<string, number>;
  const topProblems = Array.isArray(summary.top_problems) ? (summary.top_problems as AnyRec[]) : [];

  const sections: Section[] = [
    {
      id: "overview",
      title: "Site overview",
      category: "Technical",
      score: typeof summary.overall_score === "number" ? summary.overall_score : undefined,
      findings: [
        { id: "pages", label: "Pages audited", status: "info", value: (summary.pages_audited as number) ?? 0 },
        { id: "failed", label: "Pages failed", status: (summary.pages_failed as number) > 0 ? "warn" : "pass", value: (summary.pages_failed as number) ?? 0 },
        { id: "high", label: "High-severity issues", status: (issueCounts.high as number) > 0 ? "fail" : "pass", value: (issueCounts.high as number) ?? 0, severity: "high" },
        { id: "medium", label: "Medium-severity issues", status: (issueCounts.medium as number) > 0 ? "warn" : "pass", value: (issueCounts.medium as number) ?? 0, severity: "medium" },
        { id: "low", label: "Low-severity issues", status: (issueCounts.low as number) > 0 ? "info" : "pass", value: (issueCounts.low as number) ?? 0, severity: "low" },
      ],
    },
    ...Object.entries(bySection).map(([id, score]) => ({
      id,
      title: id.charAt(0).toUpperCase() + id.slice(1),
      category: categoryFor(id),
      score,
      findings: [] as Finding[],
    })),
    {
      id: "top-problems",
      title: "Top recurring problems",
      category: "Technical",
      findings: topProblems.map((p, i) => ({
        id: `p-${i}`,
        label: String(p.message ?? ""),
        status: (p.severity === "high" ? "fail" : p.severity === "medium" ? "warn" : "info") as Status,
        severity: p.severity as Severity,
        detail: `${p.count} pages affected`,
      })),
    },
  ];

  return {
    id: String(row.id ?? ""),
    type: "site_audit",
    title: String(row.start_url ?? ""),
    finished_at: (summary.finished_at as string) ?? (row.finished_at as string),
    sections,
  };
}

/** Adapts a tool_run row to a NormalizedReport. Tool-specific mapping. */
export function normalizeToolRun(row: AnyRec): NormalizedReport {
  const tool = String(row.tool ?? "");
  const result = (row.result ?? {}) as AnyRec;
  const sections: Section[] = [];

  if (tool === "website_speed") {
    const resources = (result.resources ?? {}) as AnyRec;
    sections.push({
      id: "timing",
      title: "Timing & size",
      category: "Performance",
      score: typeof result.score === "number" ? result.score : undefined,
      findings: [
        { id: "ttfb", label: "Time to first byte", status: (result.ttfb_ms as number) > 800 ? "fail" : (result.ttfb_ms as number) > 400 ? "warn" : "pass", value: `${result.ttfb_ms ?? 0} ms` },
        { id: "total", label: "Total load time", status: (result.total_ms as number) > 3000 ? "fail" : (result.total_ms as number) > 1500 ? "warn" : "pass", value: `${result.total_ms ?? 0} ms` },
        { id: "kb", label: "Page size", status: (result.kb as number) > 1500 ? "fail" : (result.kb as number) > 500 ? "warn" : "pass", value: `${result.kb ?? 0} KB` },
        { id: "gzip", label: "Compression", status: (result.gzip as boolean) ? "pass" : "warn", value: (result.gzip as boolean) ? "on" : "off" },
        { id: "cache", label: "Cache-Control header", status: (result.cache_control as string) ? "pass" : "warn", value: (result.cache_control as string) || "—" },
        { id: "cdn", label: "CDN in use", status: (result.cdn as string | null) ? "pass" : "info", value: (result.cdn as string | null) ?? "not detected" },
      ],
    });
    sections.push({
      id: "resources",
      title: "Resource counts",
      category: "Performance",
      findings: [
        { id: "scripts", label: "Scripts", status: (resources.scripts as number) > 25 ? "warn" : "pass", value: (resources.scripts as number) ?? 0 },
        { id: "styles", label: "Stylesheets", status: (resources.styles as number) > 8 ? "warn" : "pass", value: (resources.styles as number) ?? 0 },
        { id: "images", label: "Images", status: (resources.images as number) > 40 ? "warn" : "pass", value: (resources.images as number) ?? 0 },
        { id: "iframes", label: "Iframes", status: (resources.iframes as number) > 3 ? "warn" : "pass", value: (resources.iframes as number) ?? 0 },
      ],
    });
  } else if (tool === "responsive_check") {
    sections.push({
      id: "viewport",
      title: "Viewport & responsive markup",
      category: "Accessibility",
      score: typeof result.score === "number" ? result.score : undefined,
      findings: [
        { id: "vp", label: "Viewport meta tag", status: (result.responsive_viewport as boolean) ? "pass" : "fail", value: (result.viewport_meta as string) || "missing" },
        { id: "mq", label: "CSS media queries", status: (result.media_queries as number) > 0 ? "pass" : "warn", value: (result.media_queries as number) ?? 0 },
        { id: "srcset", label: "Responsive images (srcset)", status: (result.srcset_imgs as number) > 0 ? "pass" : "warn", value: `${result.srcset_imgs ?? 0}/${result.total_imgs ?? 0}` },
        { id: "picture", label: "<picture> elements", status: "info", value: (result.picture_tags as number) ?? 0 },
        { id: "fixed", label: "Fixed-width elements", status: (result.fixed_width_elements as number) > 5 ? "warn" : "pass", value: (result.fixed_width_elements as number) ?? 0 },
        { id: "flex", label: "Flexible unit ratio", status: (result.flexible_units_pct as number) >= 40 ? "pass" : "warn", value: `${result.flexible_units_pct ?? 0}%` },
      ],
    });
  } else if (tool === "html_validator") {
    const issues = Array.isArray(result.issues) ? (result.issues as AnyRec[]) : [];
    sections.push({
      id: "structure",
      title: "Document structure",
      category: "On-page",
      score: typeof result.score === "number" ? result.score : undefined,
      findings: [
        { id: "doctype", label: "Doctype", status: (result.doctype as string | null) ? "pass" : "fail", value: (result.doctype as string | null) ?? "missing" },
        { id: "lang", label: "<html lang>", status: (result.lang as string | null) ? "pass" : "warn", value: (result.lang as string | null) ?? "missing" },
        { id: "charset", label: "<meta charset>", status: (result.charset as string | null) ? "pass" : "warn", value: (result.charset as string | null) ?? "missing" },
        { id: "title", label: "Title", status: (result.title as string | null) ? "pass" : "fail", value: (result.title as string | null) ?? "missing" },
        { id: "desc", label: "Meta description", status: (result.meta_description as string | null) ? "pass" : "warn", value: (result.meta_description as string | null) ?? "missing" },
      ],
    });
    sections.push({
      id: "issues",
      title: "Validation issues",
      category: "On-page",
      findings: issues.map((i, ix) => ({
        id: `iss-${ix}`,
        label: String(i.message ?? ""),
        status: (i.severity === "error" ? "fail" : i.severity === "warning" ? "warn" : "info") as Status,
        detail: String(i.rule ?? ""),
      })),
    });
  } else if (tool === "schema_validator") {
    const byType = (result.by_type ?? {}) as Record<string, number>;
    const blocks = Array.isArray(result.blocks) ? (result.blocks as AnyRec[]) : [];
    sections.push({
      id: "coverage",
      title: "Structured data coverage",
      category: "Schema",
      score: typeof result.score === "number" ? result.score : undefined,
      findings: [
        { id: "blocks", label: "Total blocks detected", status: blocks.length ? "pass" : "warn", value: blocks.length },
        { id: "errors", label: "Invalid JSON-LD blocks", status: (result.errors as number) > 0 ? "fail" : "pass", value: (result.errors as number) ?? 0 },
        ...Object.entries(byType).slice(0, 12).map(([type, count]) => ({
          id: `type-${type}`,
          label: `Type: ${type}`,
          status: "info" as Status,
          value: count,
        })),
      ],
    });
    sections.push({
      id: "blocks",
      title: "Blocks",
      category: "Schema",
      findings: blocks.map((b, ix) => ({
        id: `b-${ix}`,
        label: `${b.format} · ${b.type}`,
        status: (b.valid ? "pass" : "fail") as Status,
        detail: (b.error as string) ?? undefined,
      })),
    });
  } else if (tool === "backlink_checker") {
    const rows = Array.isArray(result.rows) ? (result.rows as AnyRec[]) : [];
    const found = rows.filter((r) => r.found).length;
    sections.push({
      id: "coverage",
      title: "Coverage",
      category: "Backlinks",
      score: rows.length ? Math.round((found / rows.length) * 100) : undefined,
      findings: [
        { id: "found", label: "Sources linking to target", status: found > 0 ? "pass" : "fail", value: `${found}/${rows.length}` },
        { id: "target", label: "Target", status: "info", value: String(result.target ?? "") },
      ],
    });
    sections.push({
      id: "sources",
      title: "Sources",
      category: "Backlinks",
      findings: rows.map((r, ix) => ({
        id: `s-${ix}`,
        label: String(r.source ?? ""),
        status: (r.found ? "pass" : "fail") as Status,
        detail: r.error ? String(r.error) : (r.found ? `${(r.links as unknown[])?.length ?? 0} matching link(s)` : "no matching links"),
        value: r.status as number | undefined,
      })),
    });
  } else {
    // Fallback: dump result keys as info findings
    sections.push({
      id: "result",
      title: "Result",
      category: "Other",
      findings: Object.entries(result).slice(0, 40).map(([k, v]) => ({
        id: k,
        label: k,
        status: "info" as Status,
        value: typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 80) : (v as string | number),
      })),
    });
  }

  return {
    id: String(row.id ?? ""),
    type: "tool_run",
    tool,
    title: String(row.label ?? tool),
    finished_at: String(row.finished_at ?? row.created_at ?? ""),
    sections,
  };
}

// ---------------------------------------------------------------------------
// Scoring / exec summary
// ---------------------------------------------------------------------------
export interface ExecSummary {
  overall: number;
  categories: Array<{ category: Category; score: number; findings: number; failing: number }>;
  priorityIssues: Array<{ section: string; label: string; status: Status; severity?: Severity; detail?: string }>;
  totals: { pass: number; warn: number; fail: number; info: number };
}

function severityWeight(sev?: Severity, status?: Status): number {
  if (status === "fail") return sev === "high" ? 5 : sev === "medium" ? 4 : 3;
  if (status === "warn") return sev === "high" ? 3 : sev === "medium" ? 2 : 1;
  return 0;
}

export function summarize(report: NormalizedReport): ExecSummary {
  const buckets = new Map<Category, { total: number; weighted: number; findings: number; failing: number; scoreSum: number; scoreCount: number }>();
  const priority: Array<{ section: string; label: string; status: Status; severity?: Severity; detail?: string; weight: number }> = [];
  const totals = { pass: 0, warn: 0, fail: 0, info: 0 };

  for (const section of report.sections) {
    const bucket = buckets.get(section.category) ?? { total: 0, weighted: 0, findings: 0, failing: 0, scoreSum: 0, scoreCount: 0 };
    if (typeof section.score === "number") { bucket.scoreSum += section.score; bucket.scoreCount++; }
    for (const f of section.findings) {
      totals[f.status]++;
      if (f.status === "info") continue;
      bucket.findings++;
      bucket.total++;
      if (f.status === "pass") bucket.weighted += 1;
      else if (f.status === "warn") bucket.weighted += 0.5;
      if (f.status !== "pass") bucket.failing++;
      const w = severityWeight(f.severity, f.status);
      if (w > 0) priority.push({ section: section.title, label: f.label, status: f.status, severity: f.severity, detail: f.detail, weight: w });
    }
    buckets.set(section.category, bucket);
  }

  const categories = Array.from(buckets.entries()).map(([category, b]) => {
    const fromSections = b.scoreCount ? Math.round(b.scoreSum / b.scoreCount) : null;
    const fromFindings = b.total ? Math.round((b.weighted / b.total) * 100) : null;
    const score = fromSections ?? fromFindings ?? 100;
    return { category, score, findings: b.findings, failing: b.failing };
  }).sort((a, b) => a.category.localeCompare(b.category));

  const overall = categories.length
    ? Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length)
    : 100;

  priority.sort((a, b) => b.weight - a.weight);
  return {
    overall,
    categories,
    priorityIssues: priority.slice(0, 10).map(({ weight: _w, ...rest }) => rest),
    totals,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ").slice(0, 500)}"`;
}

export function toCsv(report: NormalizedReport): string {
  const header = ["section", "check", "status", "severity", "value", "detail"];
  const rows = [header.join(",")];
  for (const section of report.sections) {
    for (const f of section.findings) {
      rows.push([section.title, f.label, f.status, f.severity ?? "", f.value ?? "", f.detail ?? ""].map(csvCell).join(","));
    }
  }
  return rows.join("\n");
}