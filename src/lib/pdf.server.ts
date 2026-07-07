import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface Check { id: string; label: string; status: "pass"|"warn"|"fail"|"info"; detail?: string; value?: string | number | null; }
interface Section { id: string; title: string; score: number; checks: Check[]; }
interface Report { url: string; final_url: string; fetched_at: string; overall_score: number; sections: Section[]; meta: { status_code: number; duration_ms: number; bytes: number } }
interface AiRec { section: string; title: string; recommendations: string[] }

function sanitize(s: string): string {
  // pdf-lib WinAnsi encoder can't render smart quotes/emoji.
  return (s || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2014|\u2013/g, "-").replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildAuditPdf(report: Report, recs: AiRec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (needed: number) => { if (y - needed < M) newPage(); };
  const text = (t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const c = opts.color ?? [0.1, 0.1, 0.1];
    const lines = wrap(t, f, size, W - M * 2);
    for (const line of lines) {
      ensure(size + 4);
      page.drawText(line, { x: M, y: y - size, size, font: f, color: rgb(c[0], c[1], c[2]) });
      y -= size + 3;
    }
  };
  const spacer = (n = 6) => { y -= n; };
  const rule = () => { ensure(6); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) }); y -= 8; };

  // Header
  text("SEO Audit Report", { size: 22, bold: true });
  spacer(4);
  text(report.url, { size: 11, color: [0.35, 0.35, 0.35] });
  text(`Audited ${new Date(report.fetched_at).toLocaleString()}  ·  HTTP ${report.meta.status_code}  ·  ${report.meta.duration_ms}ms  ·  ${(report.meta.bytes/1024).toFixed(1)} KB`, { size: 9, color: [0.4, 0.4, 0.4] });
  spacer(10);

  // Overall score
  const scoreColor: [number, number, number] = report.overall_score >= 80 ? [0.2, 0.6, 0.3] : report.overall_score >= 60 ? [0.85, 0.6, 0.1] : [0.8, 0.2, 0.2];
  text(`Overall Score: ${report.overall_score}/100`, { size: 16, bold: true, color: scoreColor });
  spacer(6);
  rule();

  // Sections
  for (const s of report.sections) {
    ensure(40);
    text(`${s.title}   (${s.score}/100)`, { size: 13, bold: true });
    spacer(2);
    for (const c of s.checks) {
      const tag = c.status === "pass" ? "[PASS]" : c.status === "warn" ? "[WARN]" : c.status === "fail" ? "[FAIL]" : "[INFO]";
      const color: [number, number, number] = c.status === "pass" ? [0.2, 0.6, 0.3] : c.status === "warn" ? [0.85, 0.6, 0.1] : c.status === "fail" ? [0.8, 0.2, 0.2] : [0.4, 0.4, 0.4];
      text(`${tag} ${c.label}`, { size: 10, bold: true, color });
      if (c.detail) text(c.detail, { size: 9, color: [0.35, 0.35, 0.35] });
      if (c.value != null && c.value !== "") text(String(c.value).slice(0, 200), { size: 9, color: [0.35, 0.35, 0.35] });
      spacer(2);
    }
    spacer(6);
    rule();
  }

  // AI Recommendations
  if (recs.length) {
    newPage();
    text("AI Recommendations", { size: 16, bold: true });
    spacer(6);
    for (const r of recs) {
      ensure(30);
      text(r.title, { size: 12, bold: true });
      spacer(2);
      for (const rec of r.recommendations) {
        text(`- ${rec}`, { size: 10 });
      }
      spacer(6);
    }
  }

  return await doc.save();
}

interface CrawlPage { url: string; status: number; title: string; description: string; h1_count: number; word_count: number; bytes: number; duration_ms: number; images_missing_alt: number; noindex: boolean; }
interface CrawlIssue { url: string; severity: "high"|"medium"|"low"; message: string; }

export async function buildCrawlPdf(crawl: { start_url: string; pages_crawled: number; created_at: string; pages: CrawlPage[]; issues: CrawlIssue[] }): Promise<Uint8Array> {
  return buildCrawlPdfImpl(crawl);
}

interface SiteAuditPage { url: string; status: number; overall_score: number | null; duration_ms: number; section_scores?: Record<string, number>; top_issues?: { label: string; status: string; detail?: string }[]; error?: string }
interface SiteAuditIssue { url: string; severity: "high"|"medium"|"low"; message: string; source?: string }
interface SiteAuditSummary {
  pages_audited: number;
  pages_failed: number;
  overall_score: number;
  avg_by_section: Record<string, number>;
  issue_counts: { high: number; medium: number; low: number };
  top_problems: { message: string; count: number; severity: "high"|"medium"|"low" }[];
  finished_at: string;
}
interface SiteAuditRec { section: string; summary?: string; fixes: { title: string; impact?: string; effort?: string; steps: string[] }[] }

export async function buildSiteAuditPdf(
  data: { start_url: string; summary: SiteAuditSummary; pages: SiteAuditPage[]; issues: SiteAuditIssue[] },
  recs: SiteAuditRec[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (n: number) => { if (y - n < M) newPage(); };
  const text = (t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const c = opts.color ?? [0.1, 0.1, 0.1];
    for (const line of wrap(t, f, size, W - M * 2)) {
      ensure(size + 4);
      page.drawText(line, { x: M, y: y - size, size, font: f, color: rgb(c[0], c[1], c[2]) });
      y -= size + 3;
    }
  };
  const spacer = (n = 6) => { y -= n; };
  const rule = () => { ensure(6); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) }); y -= 8; };

  const s = data.summary;
  const scoreColor: [number, number, number] = s.overall_score >= 80 ? [0.2, 0.6, 0.3] : s.overall_score >= 60 ? [0.85, 0.6, 0.1] : [0.8, 0.2, 0.2];

  text("Whole-Site SEO Audit", { size: 22, bold: true });
  spacer(4);
  text(data.start_url, { size: 11, color: [0.35, 0.35, 0.35] });
  text(`Finished ${new Date(s.finished_at).toLocaleString()}  ·  ${s.pages_audited} pages  ·  ${s.pages_failed} failed`, { size: 9, color: [0.4, 0.4, 0.4] });
  spacer(8);
  text(`Overall Site Score: ${s.overall_score}/100`, { size: 16, bold: true, color: scoreColor });
  spacer(4);
  text(`Issues: ${s.issue_counts?.high ?? 0} high · ${s.issue_counts?.medium ?? 0} medium · ${s.issue_counts?.low ?? 0} low`, { size: 11, bold: true });
  spacer(4);
  rule();

  text("Section averages", { size: 13, bold: true });
  spacer(2);
  for (const [id, score] of Object.entries(s.avg_by_section ?? {})) {
    const col: [number, number, number] = score >= 80 ? [0.2, 0.6, 0.3] : score >= 60 ? [0.85, 0.6, 0.1] : [0.8, 0.2, 0.2];
    text(`- ${id}: ${score}/100`, { size: 10, color: col });
  }
  spacer(6);
  rule();

  text("Top recurring problems", { size: 13, bold: true });
  spacer(2);
  if (!s.top_problems?.length) text("None detected.", { size: 10, color: [0.4, 0.4, 0.4] });
  for (const p of s.top_problems ?? []) {
    const tag = p.severity === "high" ? "[HIGH]" : p.severity === "medium" ? "[MED] " : "[LOW] ";
    const col: [number, number, number] = p.severity === "high" ? [0.8, 0.2, 0.2] : p.severity === "medium" ? [0.85, 0.6, 0.1] : [0.4, 0.4, 0.4];
    text(`${tag} ${p.message}  (${p.count} pages)`, { size: 10, bold: true, color: col });
  }
  spacer(6);
  rule();

  text(`Pages (${data.pages.length})`, { size: 13, bold: true });
  spacer(2);
  for (const p of data.pages.slice(0, 200)) {
    const scoreTxt = p.overall_score == null ? "—" : `${p.overall_score}/100`;
    text(`- [${p.status || "err"}] ${scoreTxt}  ${p.url}`, { size: 9 });
    if (p.error) text(`      ${p.error}`, { size: 9, color: [0.8, 0.2, 0.2] });
  }
  spacer(6);
  rule();

  text(`All issues (${data.issues.length})`, { size: 13, bold: true });
  spacer(2);
  for (const i of data.issues.slice(0, 400)) {
    const tag = i.severity === "high" ? "[HIGH]" : i.severity === "medium" ? "[MED] " : "[LOW] ";
    const col: [number, number, number] = i.severity === "high" ? [0.8, 0.2, 0.2] : i.severity === "medium" ? [0.85, 0.6, 0.1] : [0.4, 0.4, 0.4];
    text(`${tag} ${i.url}`, { size: 9, bold: true, color: col });
    text(`      ${i.message}`, { size: 9, color: [0.35, 0.35, 0.35] });
  }

  if (recs.length) {
    newPage();
    text("AI Recommendations", { size: 16, bold: true });
    spacer(6);
    for (const r of recs) {
      ensure(30);
      text(r.section, { size: 12, bold: true });
      if (r.summary) { spacer(2); text(r.summary, { size: 10, color: [0.35, 0.35, 0.35] }); }
      for (const fix of r.fixes ?? []) {
        spacer(4);
        text(`- ${fix.title}${fix.impact ? `  [impact: ${fix.impact}]` : ""}${fix.effort ? `  [effort: ${fix.effort}]` : ""}`, { size: 10, bold: true });
        for (const step of fix.steps ?? []) text(`    • ${step}`, { size: 9 });
      }
      spacer(8);
    }
  }

  return await doc.save();
}

async function buildCrawlPdfImpl(crawl: { start_url: string; pages_crawled: number; created_at: string; pages: CrawlPage[]; issues: CrawlIssue[] }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (n: number) => { if (y - n < M) newPage(); };
  const text = (t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const c = opts.color ?? [0.1, 0.1, 0.1];
    const lines = wrap(t, f, size, W - M * 2);
    for (const line of lines) { ensure(size + 4); page.drawText(line, { x: M, y: y - size, size, font: f, color: rgb(c[0], c[1], c[2]) }); y -= size + 3; }
  };

  text("Site Crawl Report", { size: 22, bold: true });
  y -= 4;
  text(crawl.start_url, { size: 11, color: [0.35, 0.35, 0.35] });
  text(`Crawled ${crawl.pages_crawled} pages on ${new Date(crawl.created_at).toLocaleString()}`, { size: 9, color: [0.4, 0.4, 0.4] });
  y -= 8;

  const high = crawl.issues.filter(i => i.severity === "high").length;
  const med = crawl.issues.filter(i => i.severity === "medium").length;
  const low = crawl.issues.filter(i => i.severity === "low").length;
  text(`Issues: ${high} high · ${med} medium · ${low} low`, { size: 13, bold: true });
  y -= 6;

  // Aggregate issue types
  const grouped = new Map<string, number>();
  for (const i of crawl.issues) {
    const key = i.message.split(/\s*[:(]/)[0].trim();
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const top = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  text("Top Issue Types", { size: 13, bold: true });
  y -= 2;
  for (const [k, v] of top) text(`- ${k}: ${v} occurrence${v === 1 ? "" : "s"}`, { size: 10 });
  y -= 6;

  text("All Issues", { size: 13, bold: true });
  y -= 2;
  for (const i of crawl.issues.slice(0, 300)) {
    const tag = i.severity === "high" ? "[HIGH]" : i.severity === "medium" ? "[MED] " : "[LOW] ";
    const color: [number, number, number] = i.severity === "high" ? [0.8, 0.2, 0.2] : i.severity === "medium" ? [0.85, 0.6, 0.1] : [0.4, 0.4, 0.4];
    text(`${tag} ${i.url}`, { size: 9, bold: true, color });
    text(`      ${i.message}`, { size: 9, color: [0.35, 0.35, 0.35] });
  }

  return await doc.save();
}