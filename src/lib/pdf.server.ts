import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFRef } from "pdf-lib";

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
  site_signals?: { id: string; title: string; score: number; checks: Check[] }[];
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

  // ---------- TOC + link annotation helpers ----------
  type TocEntry = { title: string; page: PDFPage; targetY: number };
  const toc: TocEntry[] = [];
  const mark = (title: string) => { toc.push({ title, page, targetY: y + 8 }); };

  const attachAnnot = (p: PDFPage, annotRef: PDFRef) => {
    const existing = p.node.lookup(PDFName.of("Annots"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing && typeof (existing as any).push === "function") (existing as any).push(annotRef);
    else p.node.set(PDFName.of("Annots"), doc.context.obj([annotRef]));
  };
  const addUriLink = (p: PDFPage, rect: [number, number, number, number], url: string) => {
    const annot = doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(sanitize(url)) },
    });
    attachAnnot(p, doc.context.register(annot));
  };
  const addInternalLink = (p: PDFPage, rect: [number, number, number, number], targetPageRef: PDFRef, targetY: number) => {
    const annot = doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Dest: [targetPageRef, PDFName.of("XYZ"), null, targetY, null] as any,
    });
    attachAnnot(p, doc.context.register(annot));
  };

  // Draws a URL as a single line (truncated if needed) and attaches a URI link annotation.
  const linkedUrl = (url: string, size: number, opts: { bold?: boolean; indent?: number; color?: [number, number, number] } = {}) => {
    const f = opts.bold ? bold : font;
    const color: [number, number, number] = opts.color ?? [0.15, 0.35, 0.75];
    const x = M + (opts.indent ?? 0);
    const maxW = W - M - x;
    let display = sanitize(url);
    // Truncate with ellipsis if too wide for one line.
    if (f.widthOfTextAtSize(display, size) > maxW) {
      while (display.length > 1 && f.widthOfTextAtSize(display + "…", size) > maxW) display = display.slice(0, -1);
      display = display + "…";
    }
    ensure(size + 4);
    const lineY = y - size;
    page.drawText(display, { x, y: lineY, size, font: f, color: rgb(color[0], color[1], color[2]) });
    const w = Math.min(f.widthOfTextAtSize(display, size), maxW);
    addUriLink(page, [x, lineY - 1, x + w, lineY + size], url);
    y -= size + 3;
  };

  const s = data.summary;
  const grade = (n: number) => n >= 90 ? "Excellent" : n >= 80 ? "Good" : n >= 60 ? "Needs work" : n >= 40 ? "Poor" : "Critical";
  const gradeExplain = (n: number) =>
    n >= 90 ? "Your site is in great shape. Keep monitoring and fix minor issues as they appear."
    : n >= 80 ? "Your site is healthy overall. A few improvements will push it into top shape."
    : n >= 60 ? "There are important issues holding your rankings back. Prioritize the high-severity fixes below."
    : n >= 40 ? "Serious problems are hurting your visibility in search. Fix the high-severity issues as soon as possible."
    : "Your site has critical SEO problems. Search engines may struggle to crawl, index, or rank your pages until these are fixed.";
  const scoreColor = (n: number): [number, number, number] =>
    n >= 80 ? [0.2, 0.6, 0.3] : n >= 60 ? [0.85, 0.6, 0.1] : [0.8, 0.2, 0.2];

  const SECTION_INFO: Record<string, { title: string; what: string }> = {
    meta: { title: "Titles & Descriptions", what: "The title tag and meta description are what people see in Google. Good ones improve clicks." },
    content: { title: "Content Quality", what: "How much useful, unique text your pages have and how well it is structured with headings." },
    headings: { title: "Headings Structure", what: "Whether pages use H1/H2/H3 correctly. This helps readers and search engines understand your page." },
    links: { title: "Links", what: "Internal and external links. Broken links, missing anchor text and orphan pages all hurt SEO." },
    images: { title: "Images", what: "Alt text, file sizes and formats. Missing alt text hurts accessibility and image search." },
    performance: { title: "Speed & Performance", what: "How fast your pages load. Slow pages lose visitors and rank lower." },
    mobile: { title: "Mobile Friendliness", what: "Whether your pages work well on phones. Google uses mobile-first indexing." },
    security: { title: "Security", what: "HTTPS, HSTS and other protections. Insecure sites get flagged in browsers and rank lower." },
    social: { title: "Social & Sharing", what: "Open Graph and Twitter tags that control how your pages look when shared on social media." },
    technical: { title: "Technical SEO", what: "Robots.txt, sitemap, canonical tags, structured data and other under-the-hood signals." },
    accessibility: { title: "Accessibility", what: "Whether your site is usable for people with disabilities. Also improves SEO." },
    schema: { title: "Structured Data", what: "Schema.org markup that unlocks rich results (star ratings, FAQs, prices) in Google." },
  };
  const niceSection = (id: string) => SECTION_INFO[id]?.title ?? (id.charAt(0).toUpperCase() + id.slice(1).replace(/[_-]/g, " "));

  const sevLabel = (sev: string) => sev === "high" ? "HIGH" : sev === "medium" ? "MEDIUM" : "LOW";
  const sevColor = (sev: string): [number, number, number] => sev === "high" ? [0.8, 0.2, 0.2] : sev === "medium" ? [0.85, 0.6, 0.1] : [0.5, 0.5, 0.5];
  const sevWhy = (sev: string) => sev === "high" ? "Fix this soon - it directly hurts rankings, traffic or user trust."
    : sev === "medium" ? "Worth fixing - it holds back your SEO potential but is not urgent."
    : "Nice to fix - small polish that adds up over time.";

  // ============ COVER PAGE ============
  mark("Cover & Summary");
  text("Whole-Site SEO Audit Report", { size: 24, bold: true });
  spacer(6);
  text(data.start_url, { size: 12, color: [0.35, 0.35, 0.35] });
  text(`Report generated ${new Date(s.finished_at ?? Date.now()).toLocaleString()}`, { size: 9, color: [0.5, 0.5, 0.5] });
  spacer(14);
  rule();
  spacer(6);
  text("Overall Health", { size: 12, bold: true, color: [0.35, 0.35, 0.35] });
  spacer(2);
  text(`${s.overall_score ?? 0} / 100 - ${grade(s.overall_score ?? 0)}`, { size: 26, bold: true, color: scoreColor(s.overall_score ?? 0) });
  spacer(4);
  text(gradeExplain(s.overall_score ?? 0), { size: 11 });
  spacer(10);

  // Quick stats
  text("At a glance", { size: 13, bold: true });
  spacer(2);
  text(`- Pages audited: ${s.pages_audited ?? data.pages.length}`, { size: 11 });
  text(`- Pages that failed to load: ${s.pages_failed ?? 0}`, { size: 11 });
  text(`- High-severity issues (fix soon): ${s.issue_counts?.high ?? 0}`, { size: 11, color: sevColor("high") });
  text(`- Medium-severity issues (worth fixing): ${s.issue_counts?.medium ?? 0}`, { size: 11, color: sevColor("medium") });
  text(`- Low-severity issues (polish): ${s.issue_counts?.low ?? 0}`, { size: 11, color: sevColor("low") });
  spacer(10);
  rule();

  // ============ HOW TO READ THIS REPORT ============
  text("How to read this report", { size: 13, bold: true });
  spacer(2);
  text("This report checks your website against dozens of SEO best practices - the same signals Google uses to decide who ranks. Each finding is labelled:", { size: 10 });
  spacer(2);
  text("HIGH", { size: 10, bold: true, color: sevColor("high") });
  text("Directly hurts search rankings, traffic or user trust. Fix as soon as possible.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(2);
  text("MEDIUM", { size: 10, bold: true, color: sevColor("medium") });
  text("Holds back your SEO potential. Fix these after the high-severity items.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(2);
  text("LOW", { size: 10, bold: true, color: sevColor("low") });
  text("Minor polish. Address once the bigger items are handled.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(4);
  text("Scores are on a 0-100 scale. 80+ is good, 60-79 needs work, below 60 is a serious problem.", { size: 10, color: [0.35, 0.35, 0.35] });

  // ============ PRIORITY ACTION PLAN ============
  newPage();
  mark("Priority Action Plan");
  text("Priority Action Plan", { size: 18, bold: true });
  spacer(2);
  text("The most impactful fixes, ranked. Start at the top.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);

  const problems = (s.top_problems ?? []).slice().sort((a, b) => {
    const rank = (x: { severity: string; count: number }) => (x.severity === "high" ? 3 : x.severity === "medium" ? 2 : 1) * 1000 + x.count;
    return rank(b) - rank(a);
  });

  if (!problems.length) {
    text("No recurring problems detected. Nice work.", { size: 11, color: [0.2, 0.6, 0.3] });
  } else {
    problems.slice(0, 15).forEach((p, i) => {
      ensure(50);
      text(`${i + 1}. [${sevLabel(p.severity)}] ${p.message}`, { size: 11, bold: true, color: sevColor(p.severity) });
      text(`Affects ${p.count} page${p.count === 1 ? "" : "s"}.  ${sevWhy(p.severity)}`, { size: 9, color: [0.35, 0.35, 0.35] });
      spacer(6);
    });
  }
  spacer(6);
  rule();

  // ============ SECTION SCORECARD ============
  ensure(60);
  mark("Section Scorecard");
  text("Section Scorecard", { size: 18, bold: true });
  spacer(2);
  text("How each area of your site performs. Each section is scored 0-100.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);

  const sections = Object.entries(s.avg_by_section ?? {}).sort((a, b) => a[1] - b[1]); // worst first
  if (!sections.length) {
    text("No section data available.", { size: 10, color: [0.5, 0.5, 0.5] });
  } else {
    for (const [id, score] of sections) {
      ensure(56);
      const info = SECTION_INFO[id];
      text(`${niceSection(id)} - ${score}/100 (${grade(score)})`, { size: 12, bold: true, color: scoreColor(score) });
      if (info?.what) text(info.what, { size: 9, color: [0.35, 0.35, 0.35] });
      const takeaway = score >= 80 ? "This area looks good. Keep it up."
        : score >= 60 ? "This area needs some attention. See the recommendations below."
        : "This area is a priority - it is pulling your overall score down.";
      text(takeaway, { size: 9, color: [0.4, 0.4, 0.4] });
      spacer(8);
    }
  }

  // ============ SITE-WIDE EXTERNAL SIGNALS ============
  if (s.site_signals && s.site_signals.length) {
    newPage();
    mark("Site-wide External Signals");
    text("Site-wide External Signals", { size: 18, bold: true });
    spacer(2);
    text("Live data pulled from PageSpeed Insights, Google Search Console, Semrush and leading AI models for your homepage/domain.", { size: 10, color: [0.35, 0.35, 0.35] });
    spacer(8);
    for (const sig of s.site_signals) {
      ensure(40);
      text(`${sig.title}   (${sig.score}/100)`, { size: 13, bold: true, color: scoreColor(sig.score) });
      spacer(2);
      for (const c of sig.checks) {
        const tag = c.status === "pass" ? "[PASS]" : c.status === "warn" ? "[WARN]" : c.status === "fail" ? "[FAIL]" : "[INFO]";
        const col: [number, number, number] = c.status === "pass" ? [0.2, 0.6, 0.3] : c.status === "warn" ? [0.85, 0.6, 0.1] : c.status === "fail" ? [0.8, 0.2, 0.2] : [0.4, 0.4, 0.4];
        text(`${tag} ${c.label}${c.value != null && c.value !== "" ? ` — ${String(c.value).slice(0, 120)}` : ""}`, { size: 10, bold: true, color: col });
        if (c.detail) text(c.detail, { size: 9, color: [0.35, 0.35, 0.35] });
        spacer(2);
      }
      spacer(6);
      rule();
    }
  }

  if (recs.length) {
    newPage();
    mark("Recommendations & Step-by-Step Fixes");
    text("Recommendations & Step-by-Step Fixes", { size: 18, bold: true });
    spacer(2);
    text("Concrete actions, generated for your site, grouped by section.", { size: 10, color: [0.35, 0.35, 0.35] });
    spacer(8);

    for (const r of recs) {
      ensure(40);
      text(niceSection(r.section), { size: 13, bold: true });
      const info = SECTION_INFO[r.section];
      if (info?.what) { text(info.what, { size: 9, color: [0.4, 0.4, 0.4] }); spacer(2); }
      if (r.summary) { text(r.summary, { size: 10, color: [0.35, 0.35, 0.35] }); spacer(2); }
      for (const fix of r.fixes ?? []) {
        ensure(30);
        spacer(4);
        const badges = [fix.impact ? `Impact: ${fix.impact}` : null, fix.effort ? `Effort: ${fix.effort}` : null].filter(Boolean).join("  ·  ");
        text(`> ${fix.title}`, { size: 11, bold: true });
        if (badges) text(badges, { size: 9, color: [0.4, 0.4, 0.4] });
        for (const step of fix.steps ?? []) text(`    - ${step}`, { size: 10 });
      }
      spacer(10);
      rule();
    }
  }

  // ============ PAGE-BY-PAGE ============
  newPage();
  mark("Page-by-Page Results");
  text(`Page-by-Page Results (${data.pages.length})`, { size: 18, bold: true });
  spacer(2);
  text("Every page we audited, sorted by score. Lowest-scoring pages appear first so you know where to focus.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);

  const sortedPages = data.pages.slice().sort((a, b) => (a.overall_score ?? -1) - (b.overall_score ?? -1));
  for (const p of sortedPages.slice(0, 200)) {
    ensure(50);
    const sc = p.overall_score;
    const sTxt = sc == null ? "—" : `${sc}/100 (${grade(sc)})`;
    const col: [number, number, number] = sc == null ? [0.5, 0.5, 0.5] : scoreColor(sc);
    linkedUrl(p.url, 10, { bold: true });
    text(`Score: ${sTxt}  ·  HTTP ${p.status || "error"}  ·  Loaded in ${p.duration_ms}ms`, { size: 9, color: col });
    if (p.error) text(`Error: ${p.error}`, { size: 9, color: sevColor("high") });
    const issuesForPage = (p.top_issues ?? []).filter(x => x.status === "fail" || x.status === "warn").slice(0, 5);
    for (const it of issuesForPage) {
      const c = it.status === "fail" ? sevColor("high") : sevColor("medium");
      text(`  - [${it.status.toUpperCase()}] ${it.label}${it.detail ? `: ${it.detail}` : ""}`, { size: 9, color: c });
    }
    spacer(6);
  }
  if (sortedPages.length > 200) {
    spacer(2);
    text(`(+${sortedPages.length - 200} more pages not shown - see the app for the full list)`, { size: 9, color: [0.5, 0.5, 0.5] });
  }

  // ============ ALL ISSUES ============
  newPage();
  mark("Complete Issue Log");
  text(`Complete Issue Log (${data.issues.length})`, { size: 18, bold: true });
  spacer(2);
  text("Every individual issue found, grouped by severity so you can work through them in order.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);

  const byGroup: Record<"high"|"medium"|"low", SiteAuditIssue[]> = { high: [], medium: [], low: [] };
  for (const i of data.issues) byGroup[i.severity]?.push(i);
  for (const sev of ["high", "medium", "low"] as const) {
    const list = byGroup[sev];
    if (!list.length) continue;
    ensure(30);
    text(`${sevLabel(sev)} severity  (${list.length})`, { size: 13, bold: true, color: sevColor(sev) });
    text(sevWhy(sev), { size: 9, color: [0.4, 0.4, 0.4] });
    spacer(4);
    for (const it of list.slice(0, 300)) {
      ensure(24);
      text(`- ${it.message}`, { size: 9, bold: true });
      linkedUrl(it.url, 9, { indent: 12 });
    }
    if (list.length > 300) text(`   (+${list.length - 300} more not shown)`, { size: 9, color: [0.5, 0.5, 0.5] });
    spacer(8);
    rule();
  }

  // ============ GLOSSARY ============
  newPage();
  mark("Glossary");
  text("Glossary - SEO terms in plain English", { size: 18, bold: true });
  spacer(8);
  const glossary: [string, string][] = [
    ["Title tag", "The clickable headline shown in Google. Should be unique and under ~60 characters."],
    ["Meta description", "The short summary under the title in Google. Aim for 120-160 characters."],
    ["H1", "The main heading on a page. Each page should have exactly one that describes the page's topic."],
    ["Canonical tag", "Tells Google which version of a page is the master copy. Prevents duplicate-content problems."],
    ["Alt text", "A short description of an image for screen readers and Google Image Search."],
    ["Robots.txt", "A file that tells search engines which pages they may or may not crawl."],
    ["Sitemap", "An XML file listing your pages, so search engines can discover them quickly."],
    ["Structured data (Schema)", "Machine-readable tags that unlock rich results like star ratings, FAQs and prices."],
    ["Core Web Vitals", "Google's speed and stability metrics (LCP, INP, CLS). Faster pages rank better."],
    ["HTTPS / SSL", "Encrypted connection. Non-HTTPS sites are flagged as Not Secure and rank lower."],
    ["HSTS", "A security header that forces browsers to always use HTTPS for your domain."],
    ["Open Graph", "Tags that control the title, description and image shown when someone shares your page on Facebook, LinkedIn, etc."],
    ["Internal link", "A link from one page on your site to another. Helps Google discover pages and pass authority."],
    ["Backlink", "A link from another site to yours. High-quality backlinks improve rankings."],
    ["Orphan page", "A page with no internal links pointing to it. Hard for Google to find."],
    ["Crawl", "When a search engine bot visits and reads your pages."],
    ["Index", "The database Google keeps of pages it might show in results. If a page is not indexed, it cannot rank."],
  ];
  for (const [term, def] of glossary) {
    ensure(22);
    text(term, { size: 11, bold: true });
    text(def, { size: 9, color: [0.35, 0.35, 0.35] });
    spacer(4);
  }

  // ============ FOOTER ============
  spacer(10);
  rule();
  text("End of report", { size: 9, color: [0.5, 0.5, 0.5] });
  text(`Generated by SEO Audit Tool for ${data.start_url}`, { size: 9, color: [0.5, 0.5, 0.5] });

  // ============ TABLE OF CONTENTS ============
  // Build TOC pages AFTER content so we know each section's real destination page.
  // Insert them right after the cover page (index 1..).
  const tocPages: PDFPage[] = [];
  const makeTocPage = () => {
    const insertAt = 1 + tocPages.length;
    const tp = doc.insertPage(insertAt, [W, H]);
    tocPages.push(tp);
    return tp;
  };
  let tp = makeTocPage();
  let ty = H - M;
  const drawTocText = (t: string, size: number, isBold: boolean, x = M, color: [number, number, number] = [0.1, 0.1, 0.1]) => {
    const f = isBold ? bold : font;
    tp.drawText(sanitize(t), { x, y: ty - size, size, font: f, color: rgb(color[0], color[1], color[2]) });
  };
  drawTocText("Contents", 22, true);
  ty -= 22 + 10;
  tp.drawLine({ start: { x: M, y: ty }, end: { x: W - M, y: ty }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  ty -= 14;
  drawTocText("Click any entry to jump to that section.", 9, false, M, [0.5, 0.5, 0.5]);
  ty -= 20;

  // Resolve each section's live page number now that TOC pages have been inserted.
  const allPages = doc.getPages();
  for (const entry of toc) {
    if (ty - 22 < M) {
      // Overflow to another TOC page.
      tp = makeTocPage();
      ty = H - M;
      drawTocText("Contents (continued)", 16, true);
      ty -= 26;
    }
    const pageNum = allPages.indexOf(entry.page) + 1;
    const entrySize = 12;
    const rowY = ty - entrySize;
    // Title
    tp.drawText(sanitize(entry.title), { x: M, y: rowY, size: entrySize, font: bold, color: rgb(0.15, 0.35, 0.75) });
    // Page number, right-aligned
    const pageStr = String(pageNum);
    const pageW = font.widthOfTextAtSize(pageStr, entrySize);
    tp.drawText(pageStr, { x: W - M - pageW, y: rowY, size: entrySize, font, color: rgb(0.3, 0.3, 0.3) });
    // Dotted leader
    const titleW = bold.widthOfTextAtSize(sanitize(entry.title), entrySize);
    const dotsStartX = M + titleW + 6;
    const dotsEndX = W - M - pageW - 6;
    if (dotsEndX > dotsStartX) {
      const dotW = font.widthOfTextAtSize(".", entrySize);
      const dotCount = Math.floor((dotsEndX - dotsStartX) / (dotW + 1));
      tp.drawText(".".repeat(Math.max(0, dotCount)), { x: dotsStartX, y: rowY, size: entrySize, font, color: rgb(0.7, 0.7, 0.7) });
    }
    // Full-row clickable link
    addInternalLink(tp, [M, rowY - 2, W - M, rowY + entrySize + 2], entry.page.ref, entry.targetY);
    ty -= entrySize + 12;
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