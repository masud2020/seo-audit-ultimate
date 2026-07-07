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

// Shared vertical-metrics helpers so every text call lands on the same baseline
// grid and every centered label sits visually centered inside its box.
// - ascentOf: distance from baseline to the top of a capital letter.
// - lineAdvanceOf: baseline-to-baseline distance for stacked lines.
// - centerBaselineY: baseline y that visually centers text inside a box whose
//   top edge is `topY` and whose height is `boxH`.
function ascentOf(f: PDFFont, size: number): number {
  return f.heightAtSize(size, { descender: false });
}
function lineAdvanceOf(f: PDFFont, size: number): number {
  return f.heightAtSize(size) + 1;
}
function centerBaselineY(topY: number, boxH: number, f: PDFFont, size: number): number {
  const asc = ascentOf(f, size);
  return topY - (boxH - asc) / 2 - asc;
}

export async function buildAuditPdf(report: Report, recs: AiRec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  const FOOTER_Y = 28;
  const HEADER_Y = H - 22;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  // TOC + link helpers
  type TocEntry = { title: string; page: PDFPage; targetY: number };
  const toc: TocEntry[] = [];
  const mark = (title: string) => { toc.push({ title, page, targetY: y + 8 }); };
  const attachAnnot = (p: PDFPage, annotRef: PDFRef) => {
    const existing = p.node.lookup(PDFName.of("Annots"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing && typeof (existing as any).push === "function") (existing as any).push(annotRef);
    else p.node.set(PDFName.of("Annots"), doc.context.obj([annotRef]));
  };
  const addInternalLink = (p: PDFPage, rect: [number, number, number, number], targetPageRef: PDFRef, targetY: number) => {
    const annot = doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Dest: [targetPageRef, PDFName.of("XYZ"), null, targetY, null] as any,
    });
    attachAnnot(p, doc.context.register(annot));
  };

  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (needed: number) => { if (y - needed < M + FOOTER_Y) newPage(); };
  const text = (t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const c = opts.color ?? [0.1, 0.1, 0.1];
    const lines = wrap(t, f, size, W - M * 2);
    const asc = ascentOf(f, size);
    const lh = lineAdvanceOf(f, size);
    for (const line of lines) {
      ensure(lh);
      page.drawText(line, { x: M, y: y - asc, size, font: f, color: rgb(c[0], c[1], c[2]) });
      y -= lh;
    }
  };
  const spacer = (n = 6) => { y -= n; };
  const rule = () => { ensure(6); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) }); y -= 8; };

  // ============ Helpers ============
  const scoreColor = (n: number): [number, number, number] =>
    n >= 80 ? [0.2, 0.6, 0.3] : n >= 60 ? [0.85, 0.6, 0.1] : [0.8, 0.2, 0.2];
  const grade = (n: number) =>
    n >= 90 ? "Excellent" : n >= 80 ? "Good" : n >= 60 ? "Needs work" : n >= 40 ? "Poor" : "Critical";
  const statusMeta = (st: Check["status"]) => {
    if (st === "pass") return { label: "PASS", color: [0.2, 0.6, 0.3] as [number, number, number], bg: [0.88, 0.96, 0.90] as [number, number, number] };
    if (st === "warn") return { label: "WARN", color: [0.85, 0.6, 0.1] as [number, number, number], bg: [0.99, 0.94, 0.82] as [number, number, number] };
    if (st === "fail") return { label: "FAIL", color: [0.8, 0.2, 0.2] as [number, number, number], bg: [0.99, 0.88, 0.88] as [number, number, number] };
    return { label: "INFO", color: [0.4, 0.4, 0.4] as [number, number, number], bg: [0.93, 0.93, 0.95] as [number, number, number] };
  };
  // Draw a small filled badge with text; return width used.
  const drawBadge = (x: number, yTop: number, label: string, color: [number, number, number], bg: [number, number, number]) => {
    const size = 8;
    const padX = 5, padY = 2.5;
    const w = bold.widthOfTextAtSize(label, size) + padX * 2;
    const h = size + padY * 2;
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: rgb(bg[0], bg[1], bg[2]) });
    page.drawText(label, { x: x + padX, y: centerBaselineY(yTop, h, bold, size), size, font: bold, color: rgb(color[0], color[1], color[2]) });
    return w;
  };
  // Section header with a colored left bar.
  const sectionHeader = (title: string, score: number) => {
    ensure(34);
    const barH = 26;
    const col = scoreColor(score);
    // Subtle banded background across full column
    page.drawRectangle({ x: M, y: y - barH, width: W - M * 2, height: barH, color: rgb(0.97, 0.97, 0.99) });
    // Colored accent bar on the left
    page.drawRectangle({ x: M, y: y - barH, width: 4, height: barH, color: rgb(col[0], col[1], col[2]) });
    const titleSize = 13;
    page.drawText(sanitize(title), { x: M + 14, y: centerBaselineY(y, barH, bold, titleSize), size: titleSize, font: bold, color: rgb(0.1, 0.1, 0.1) });
    const scoreStr = `${score}/100`;
    const scoreSize = 12;
    const sw = bold.widthOfTextAtSize(scoreStr, scoreSize);
    page.drawText(scoreStr, { x: W - M - sw - 8, y: centerBaselineY(y, barH, bold, scoreSize), size: scoreSize, font: bold, color: rgb(col[0], col[1], col[2]) });
    y -= barH + 8;
  };
  // Anchors so Priority Issues can link into Detailed Findings.
  const checkAnchors = new Map<Check, { page: PDFPage; y: number }>();
  const pendingCrossLinks: { page: PDFPage; rect: [number, number, number, number]; check: Check }[] = [];

  // Static "how to fix" guidance: summary + 3-5 step checklist per check ID.
  type FixGuidance = { summary: string; steps: string[] };
  const FIX_HINTS: Record<string, FixGuidance> = {
    title: { summary: "Write a unique <title> tag 30-60 characters long that describes the page and includes your main keyword.", steps: ["Draft a title that names the page's main topic in 30-60 characters.", "Front-load the primary keyword or product name.", "Keep it unique across every page on the site.", "Add the brand name at the end after a separator (| or -).", "Preview in a SERP simulator to confirm it isn't truncated."] },
    desc: { summary: "Add a unique meta description 120-160 characters long that summarises the page and invites a click.", steps: ["Summarise the page value in 120-160 characters.", "Include the primary keyword naturally.", "End with a clear call to action (Learn more, Get started).", "Make it unique - no duplicates across pages.", "Verify it renders correctly in Google's SERP preview."] },
    canonical: { summary: "Add a <link rel=\"canonical\"> pointing to the preferred URL for this page to prevent duplicate content.", steps: ["Pick the single preferred URL for the page (https, trailing slash, casing).", "Add <link rel=\"canonical\" href=\"...\"> inside <head>.", "Use an absolute URL, not a relative path.", "Ensure the canonical points to a 200 OK page, not a redirect.", "Re-crawl to confirm duplicates now resolve to the canonical."] },
    "canonical-self": { summary: "Set the canonical tag to the page's own final URL to avoid ambiguity.", steps: ["Compare rel=canonical href with the page's final URL after redirects.", "Update the tag to match the final URL exactly.", "Include https and the correct hostname.", "Redeploy and re-crawl with Google Search Console's URL Inspection tool."] },
    hreflang: { summary: "Add hreflang tags for each language/region variant, including an x-default fallback.", steps: ["List every localised URL for this page.", "Add <link rel=\"alternate\" hreflang=\"xx-YY\" href=\"...\"> for each.", "Include a reciprocal hreflang on every variant.", "Add an x-default entry for the fallback language.", "Validate with an hreflang checker."] },
    xdefault: { summary: "Add an hreflang=\"x-default\" tag pointing to the default language version.", steps: ["Identify the fallback URL for users whose language isn't matched.", "Add <link rel=\"alternate\" hreflang=\"x-default\" href=\"...\">.", "Ensure the URL returns 200 OK.", "Validate the full hreflang cluster."] },
    lang: { summary: "Set <html lang=\"xx\"> so browsers and search engines know the page language.", steps: ["Add lang=\"en\" (or your ISO code) to the <html> tag.", "Use region codes for localised variants (e.g. en-GB).", "Ensure it matches the actual content language.", "Redeploy and re-test with an accessibility checker."] },
    charset: { summary: "Add <meta charset=\"utf-8\"> as the first tag inside <head>.", steps: ["Insert <meta charset=\"utf-8\"> as the first element inside <head>.", "Remove any conflicting charset declarations.", "Confirm the server also sends Content-Type: text/html; charset=utf-8."] },
    viewport: { summary: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> so the page is mobile-friendly.", steps: ["Add the viewport meta tag inside <head>.", "Set content=\"width=device-width, initial-scale=1\".", "Do not disable pinch-to-zoom (avoid user-scalable=no).", "Test on a real phone or Chrome device emulator."] },
    favicon: { summary: "Add a favicon so browsers and search results display your brand icon.", steps: ["Create a 32x32 and 180x180 icon (PNG or ICO).", "Add <link rel=\"icon\" href=\"/favicon.ico\">.", "Add <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">.", "Verify /favicon.ico returns 200 in DevTools Network tab."] },
    h1: { summary: "Add exactly one clear <h1> that describes the page's main topic.", steps: ["Audit the page for zero or multiple H1s.", "Choose the phrase that best describes the page's topic.", "Wrap it in a single <h1> tag.", "Demote extra H1s to H2s.", "Re-run the audit."] },
    headings: { summary: "Use headings in order (H1 > H2 > H3) without skipping levels, and make sure each section has a heading.", steps: ["Outline the page as a hierarchy.", "Use one H1 for the page topic.", "Use H2 for main sections, H3 for sub-sections.", "Don't jump from H2 to H4.", "Ensure headings describe the section, not styling."] },
    content: { summary: "Add more unique, useful body copy - aim for at least 300-500 well-structured words on key pages.", steps: ["Identify pages under 300 words.", "Expand with genuinely useful information (FAQs, examples, specs).", "Break content into short paragraphs with subheadings.", "Ensure the content is unique - not copied from other pages.", "Re-audit after publishing."] },
    "word-count": { summary: "Increase the page's word count with genuinely useful information relevant to the query.", steps: ["Research what the top-ranking pages cover.", "Add missing sub-topics as H2 sections.", "Include original insights, data, or examples.", "Aim for 500+ words on important landing pages.", "Avoid padding with fluff."] },
    flesch: { summary: "Simplify writing: shorter sentences, common words, and clear paragraphs to improve readability.", steps: ["Aim for a Flesch score of 60+.", "Break long sentences (>20 words) into two.", "Replace jargon with plain language.", "Use bullet lists for enumerations.", "Read the page aloud to check flow."] },
    "keyword-diversity": { summary: "Broaden the vocabulary around your topic - mix synonyms and related terms instead of repeating one keyword.", steps: ["Research related terms (Google auto-suggest, People Also Ask).", "Weave synonyms into headings and body.", "Cover related sub-topics (LSI keywords).", "Avoid keyword stuffing.", "Recheck density is natural (<2%)."] },
    alt: { summary: "Add descriptive alt text to every meaningful <img>. Use alt=\"\" only for purely decorative images.", steps: ["List every <img> without alt text.", "Write a short description of what the image conveys.", "Include the keyword only if it accurately describes the image.", "Use alt=\"\" for purely decorative images.", "Re-audit to confirm 100% coverage."] },
    "img-alt-cov": { summary: "Audit all images and add alt text where it is missing.", steps: ["Run an accessibility scan to list images missing alt.", "Prioritise images above the fold and in main content.", "Write descriptive, human-readable alt text.", "Mark decorative images with alt=\"\".", "Retest until coverage hits 100%."] },
    "img-count": { summary: "Reduce the number of images or lazy-load them so the page stays fast.", steps: ["Remove non-essential images.", "Combine multiple images into a sprite where possible.", "Add loading=\"lazy\" to below-the-fold images.", "Serve modern formats (WebP, AVIF).", "Retest LCP and page weight."] },
    lazy: { summary: "Add loading=\"lazy\" to below-the-fold images so they don't block first paint.", steps: ["Identify images below the fold.", "Add loading=\"lazy\" and decoding=\"async\".", "Keep hero/LCP images eager (loading=\"eager\").", "Retest LCP with PageSpeed Insights."] },
    images: { summary: "Compress images (use WebP/AVIF) and add width/height attributes to reduce layout shift.", steps: ["Compress all images (Squoosh, ImageOptim).", "Convert to WebP or AVIF with a fallback.", "Add explicit width and height attributes.", "Serve responsive images with srcset.", "Retest with Lighthouse."] },
    links: { summary: "Fix broken links, add descriptive anchor text, and make sure important pages are linked internally.", steps: ["Run a link checker to find 4xx/5xx links.", "Fix or remove each broken link.", "Rewrite generic anchor text (\"click here\") to be descriptive.", "Add contextual internal links between related pages.", "Re-audit until zero broken links."] },
    broken: { summary: "Fix or remove 404/broken links - use a link checker to catch new breakages regularly.", steps: ["Run a crawler (Screaming Frog, Sitebulb).", "Export the list of 4xx/5xx URLs.", "Fix or 301-redirect each one.", "Update source pages to point to the new URL.", "Schedule a monthly recheck."] },
    "empty-links": { summary: "Give every link visible anchor text (or an aria-label) instead of leaving it blank.", steps: ["Find all <a> tags with no visible text.", "Add descriptive text inside the link.", "For icon links, add aria-label=\"...\".", "Ensure the link's purpose is clear without context.", "Retest with an accessibility tool."] },
    "internal-links": { summary: "Add more internal links between related pages so search engines can crawl your site.", steps: ["Identify orphan pages (no inbound internal links).", "Add contextual links from related content.", "Update navigation and footer to expose key pages.", "Use descriptive anchor text.", "Aim for 3+ internal links per page."] },
    "external-links": { summary: "Only link out to reputable sources; add rel=\"nofollow sponsored\" where appropriate.", steps: ["Audit outbound links for spammy or low-quality domains.", "Remove or replace low-quality links.", "Add rel=\"nofollow\" to untrusted links.", "Add rel=\"sponsored\" for paid links.", "Add rel=\"ugc\" for user-generated content."] },
    robots: { summary: "Publish a /robots.txt file that allows crawling of important pages and points to your sitemap.", steps: ["Create /robots.txt at the site root.", "Allow crawling of public content (User-agent: *  Allow: /).", "Disallow private/admin paths.", "Add \"Sitemap: https://example.com/sitemap.xml\".", "Validate with Google Search Console's robots.txt tester."] },
    "robots-exists": { summary: "Create a /robots.txt file at the site root.", steps: ["Create a plain-text file named robots.txt.", "Put it at the site root (https://example.com/robots.txt).", "Add a basic User-agent: * rule.", "Reference your sitemap.", "Verify it returns 200 OK."] },
    "robots-open": { summary: "Make sure robots.txt does not accidentally block search engines from your public pages.", steps: ["Open your current robots.txt.", "Check for \"Disallow: /\" or overly broad rules.", "Remove rules that block important paths.", "Test key URLs with Google's robots.txt Tester.", "Re-request indexing after fixing."] },
    "robots-meta": { summary: "Remove any noindex/nofollow meta robots tags from pages you want indexed.", steps: ["Search the HTML for <meta name=\"robots\" ...>.", "Remove noindex from public pages.", "Remove nofollow unless intentional.", "Rebuild and redeploy.", "Request re-indexing in Search Console."] },
    "robots-sitemap": { summary: "Add a `Sitemap:` line in robots.txt pointing to your XML sitemap.", steps: ["Open robots.txt.", "Append \"Sitemap: https://example.com/sitemap.xml\" on its own line.", "Use an absolute URL.", "Deploy and verify with curl.", "Resubmit the sitemap in Google Search Console."] },
    sitemap: { summary: "Publish an XML sitemap and reference it from robots.txt and Google Search Console.", steps: ["Generate an XML sitemap of all canonical URLs.", "Publish it at /sitemap.xml.", "Reference it in robots.txt.", "Submit it in Google Search Console.", "Automate regeneration on publish."] },
    "sitemap-exists": { summary: "Generate an XML sitemap at /sitemap.xml listing all indexable URLs.", steps: ["Use your CMS or a generator to build sitemap.xml.", "Include only canonical, indexable URLs.", "Deploy to https://your-domain/sitemap.xml.", "Confirm it returns 200 with correct XML.", "Submit in Google Search Console."] },
    "sitemap-urls": { summary: "Include all canonical, indexable URLs in the sitemap and remove noindex/404 pages.", steps: ["Regenerate the sitemap from your live URL list.", "Exclude URLs with noindex or 4xx status.", "Include lastmod dates.", "Split into multiple sitemaps if over 50k URLs.", "Resubmit in Search Console."] },
    jsonld: { summary: "Add JSON-LD structured data (Article, Product, Organization, FAQ, etc.) matching your content.", steps: ["Identify the schema type that matches this page.", "Generate JSON-LD (schema.org's generator or a plugin).", "Insert inside <script type=\"application/ld+json\">.", "Test with Google's Rich Results Test.", "Fix warnings and redeploy."] },
    structured: { summary: "Add and validate schema.org structured data with Google's Rich Results Test.", steps: ["Pick the most relevant schema type.", "Add JSON-LD markup in <head>.", "Include all required fields.", "Validate with the Rich Results Test.", "Monitor rich-result impressions in Search Console."] },
    https: { summary: "Serve every URL over HTTPS and 301-redirect http:// requests to https://.", steps: ["Install a valid SSL certificate on the origin.", "Force HTTPS with a 301 redirect from http.", "Update internal links to https://.", "Update canonical tags and sitemap to https.", "Verify with an SSL checker."] },
    ssl: { summary: "Install a valid SSL certificate (e.g. Let's Encrypt) and renew it before expiry.", steps: ["Provision an SSL cert (Let's Encrypt is free).", "Configure the web server to serve it.", "Enable auto-renewal (certbot, hosting panel).", "Verify no mixed-content warnings.", "Test with ssllabs.com."] },
    hsts: { summary: "Add a Strict-Transport-Security header with a long max-age.", steps: ["Confirm HTTPS is fully working first.", "Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains.", "Test with securityheaders.com.", "Once stable, submit to hstspreload.org.", "Monitor for issues on subdomains."] },
    csp: { summary: "Add a Content-Security-Policy header to restrict which scripts, styles, and frames can load.", steps: ["Inventory external scripts, styles, images, and frames.", "Draft a CSP allowing only those origins.", "Deploy in Content-Security-Policy-Report-Only first.", "Review violation reports and tighten.", "Switch to enforcing mode."] },
    xfo: { summary: "Add X-Frame-Options: SAMEORIGIN (or a frame-ancestors CSP) to block clickjacking.", steps: ["Add header X-Frame-Options: SAMEORIGIN.", "Or prefer CSP: frame-ancestors 'self'.", "Redeploy.", "Test with securityheaders.com."] },
    xcto: { summary: "Add X-Content-Type-Options: nosniff.", steps: ["Add header X-Content-Type-Options: nosniff.", "Ensure Content-Type is set correctly on every response.", "Redeploy.", "Verify with curl -I."] },
    referrer: { summary: "Add Referrer-Policy: strict-origin-when-cross-origin (or stricter).", steps: ["Add header Referrer-Policy: strict-origin-when-cross-origin.", "Verify analytics still receive expected referrer data.", "Redeploy.", "Retest with securityheaders.com."] },
    "perm-policy": { summary: "Add a Permissions-Policy header to disable browser features you don't use.", steps: ["List browser features the site uses (camera, mic, geolocation, etc.).", "Disable everything else in a Permissions-Policy header.", "Example: Permissions-Policy: camera=(), microphone=(), geolocation=().", "Redeploy.", "Verify with securityheaders.com."] },
    coop: { summary: "Add Cross-Origin-Opener-Policy: same-origin for extra isolation.", steps: ["Add header Cross-Origin-Opener-Policy: same-origin.", "Test any window.open flows still work.", "Consider pairing with COEP for full isolation.", "Redeploy."] },
    security: { summary: "Review your security headers - add HSTS, CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy.", steps: ["Scan the site with securityheaders.com.", "Add each missing header.", "Prioritise HSTS, CSP, and X-Content-Type-Options.", "Re-scan until you hit an A grade.", "Automate a monthly re-scan."] },
    performance: { summary: "Improve Core Web Vitals: compress images, defer non-critical JS, cache aggressively, and use a CDN.", steps: ["Run PageSpeed Insights and note failing metrics.", "Compress images and serve WebP/AVIF.", "Defer or async non-critical JavaScript.", "Add long cache headers to static assets.", "Serve via a CDN."] },
    "performance-extra": { summary: "Preload critical assets, minify CSS/JS, and remove unused code to speed things up.", steps: ["Preload key fonts and the LCP image.", "Minify and gzip/brotli-compress CSS and JS.", "Tree-shake unused code from the JS bundle.", "Split code and lazy-load routes.", "Re-run Lighthouse."] },
    cwv: { summary: "Optimise Core Web Vitals (LCP, INP, CLS) - fix slow images, blocking scripts, and layout shifts.", steps: ["Identify the LCP element and speed it up (preload, smaller image).", "Reduce JS work to improve INP (code split, defer).", "Reserve space for images/ads/fonts to fix CLS.", "Retest with real-user data in CrUX.", "Iterate until all vitals are green."] },
    ttfb: { summary: "Reduce Time To First Byte - use faster hosting, caching, and CDN edge delivery.", steps: ["Measure TTFB from multiple regions.", "Move to faster hosting or a nearby region.", "Enable full-page caching where possible.", "Serve HTML through a CDN (Cloudflare, Fastly).", "Cache database queries."] },
    size: { summary: "Reduce page weight - compress assets, split code, and remove unused libraries.", steps: ["Audit the page's transfer size in DevTools.", "Compress all images.", "Enable gzip or brotli on the server.", "Remove unused JS/CSS.", "Aim for under 1MB total."] },
    dom: { summary: "Simplify DOM: fewer nested elements and total nodes to help rendering and interactivity.", steps: ["Measure DOM node count in DevTools.", "Remove unnecessary wrapper elements.", "Virtualise long lists.", "Split massive components.", "Aim for under 1500 nodes."] },
    "blocking-js": { summary: "Defer or async non-critical <script> tags so they don't block the initial render.", steps: ["Identify render-blocking <script> tags in <head>.", "Add async or defer attributes.", "Move analytics tags to the end of <body>.", "Retest LCP and FCP.", "Fix any script that depends on load order."] },
    stylesheets: { summary: "Inline critical CSS and defer the rest so the page paints faster.", steps: ["Extract the above-the-fold CSS.", "Inline it in <head>.", "Load the rest via <link rel=\"preload\" as=\"style\" onload=...>.", "Remove unused CSS.", "Retest with Lighthouse."] },
    cdn: { summary: "Serve static assets through a CDN so users get them from a nearby edge.", steps: ["Sign up for a CDN (Cloudflare, Bunny, Fastly).", "Point your DNS or origin to it.", "Cache static assets aggressively.", "Verify assets serve from CDN edges.", "Monitor cache hit ratio."] },
    mobile: { summary: "Test on real devices - use a responsive layout, tap targets 48x48+, and no horizontal scroll.", steps: ["Test the page on a real phone.", "Set viewport meta correctly.", "Use responsive layouts (flex/grid, media queries).", "Ensure tap targets are 48x48px+.", "Fix any horizontal scroll."] },
    accessibility: { summary: "Fix WCAG violations - colour contrast, focus states, keyboard navigation, and ARIA labels.", steps: ["Run axe DevTools or Lighthouse Accessibility.", "Fix colour contrast issues.", "Add visible focus states.", "Ensure keyboard navigation works.", "Add ARIA labels to icon-only buttons."] },
    "button-names": { summary: "Give every <button> visible text or an aria-label so screen readers can announce it.", steps: ["Find <button> elements with no text.", "Add descriptive visible text where possible.", "Otherwise add aria-label=\"...\".", "For icon buttons, describe the action, not the icon.", "Retest with a screen reader."] },
    "input-labels": { summary: "Associate every <input> with a <label> (via for/id) so forms are accessible.", steps: ["Find inputs without a matching <label>.", "Add <label for=\"input-id\">.", "Or wrap the input inside the label.", "For hidden labels, use aria-label instead of removing them.", "Retest with an accessibility tool."] },
    "skip-link": { summary: "Add a visually-hidden \"Skip to main content\" link as the first focusable element.", steps: ["Add <a href=\"#main\" class=\"skip-link\">Skip to main content</a> as the first element in <body>.", "Style it to be visually hidden until focused.", "Make sure #main matches a landmark on the page.", "Test with Tab key.", "Retest with axe."] },
    meta: { summary: "Fill in missing meta tags (title, description, viewport, charset, Open Graph, Twitter card).", steps: ["Audit <head> for missing tags.", "Add a unique title and meta description.", "Add viewport and charset.", "Add Open Graph and Twitter card tags.", "Retest with a metadata inspector."] },
    onpage: { summary: "Tighten on-page basics: unique title, meta description, one H1, and clear body content.", steps: ["Review the page's title, description, and H1.", "Make sure each is unique and describes the page.", "Ensure exactly one H1.", "Add enough useful body content.", "Re-run the audit."] },
    ga: { summary: "Install web analytics (Google Analytics 4, Plausible, etc.) so you can measure improvements.", steps: ["Pick an analytics tool (GA4, Plausible, Fathom).", "Add the tracking snippet to every page.", "Set up key conversion events.", "Verify data is arriving in real time.", "Bookmark a weekly report."] },
    notfound: { summary: "Serve a helpful 404 page with search and links back to key sections.", steps: ["Design a friendly 404 template.", "Include site search and top navigation.", "Link to popular pages.", "Ensure the response status is actually 404.", "Log 404s to spot broken links."] },
  };
  const GENERIC_FIX: FixGuidance = {
    summary: "Address this issue - the AI Recommendations section has more detail.",
    steps: [
      "Read the finding's detail and value to understand what triggered it.",
      "Check the AI Recommendations section for a tailored fix.",
      "Implement the change on staging and re-run this audit to confirm.",
    ],
  };
  function fixHint(c: Check): FixGuidance {
    const direct = FIX_HINTS[c.id];
    if (direct) return direct;
    const lower = (c.label || "").toLowerCase();
    if (lower.includes("open graph") || lower.includes("og:")) return { summary: "Add Open Graph tags for rich social previews.", steps: ["Add og:title, og:description, og:image, og:url, og:type in <head>.", "Use an absolute URL for og:image (1200x630 recommended).", "Keep og:title under 60 characters.", "Validate with Facebook's Sharing Debugger."] };
    if (lower.includes("twitter")) return { summary: "Add Twitter Card tags.", steps: ["Add twitter:card (summary_large_image).", "Add twitter:title, twitter:description, twitter:image.", "Use an absolute URL for twitter:image.", "Validate with Twitter/X's Card Validator."] };
    if (lower.includes("gsc") || lower.includes("search console")) return { summary: "Connect Google Search Console and act on its data.", steps: ["Verify the domain in Google Search Console.", "Submit your XML sitemap.", "Review Coverage report and fix reported issues.", "Monitor Performance for CTR and position drops."] };
    if (lower.includes("ai")) return { summary: "Improve on-page clarity, add schema, and publish authoritative content so AI answer engines can cite you.", steps: ["Add clear H2/H3 subheadings that mirror common questions.", "Add FAQ or HowTo schema where relevant.", "Cite primary sources with descriptive anchor text.", "Publish an About/Author page to establish E-E-A-T."] };
    return GENERIC_FIX;
  }

  // A check row with a badge on the left and wrapped label/detail on the right.
  const drawCheck = (c: Check) => {
    const meta = statusMeta(c.status);
    const badgeW = bold.widthOfTextAtSize(meta.label, 8) + 10;
    const textX = M + badgeW + 8;
    const maxW = W - M - textX;
    const labelLines = wrap(c.label, bold, 10, maxW);
    const detailLines = c.detail ? wrap(c.detail, font, 9, maxW) : [];
    const valStr = c.value != null && c.value !== "" ? String(c.value).slice(0, 240) : "";
    const valueLines = valStr ? wrap(valStr, font, 9, maxW) : [];
    const showFix = c.status === "fail" || c.status === "warn";
    const guidance = showFix ? fixHint(c) : null;
    const hintLines = guidance ? wrap(`How to fix (rule: ${c.id}): ${guidance.summary}`, font, 9, maxW) : [];
    const stepLines: string[][] = guidance ? guidance.steps.map(s => wrap(`- ${s}`, font, 9, maxW - 10)) : [];
    const stepsTotal = stepLines.reduce((n, arr) => n + arr.length, 0);
    const rowH = Math.max(16,
      labelLines.length * 13
      + detailLines.length * 12
      + valueLines.length * 12
      + hintLines.length * 12
      + stepsTotal * 12
      + 4,
    );
    ensure(rowH + 4);
    // Record the row's anchor BEFORE drawing so cross-links land at the top of the row.
    const anchorY = y + 4;
    checkAnchors.set(c, { page, y: anchorY });
    drawBadge(M, y, meta.label, meta.color, meta.bg);
    let ly = y;
    for (const line of labelLines) {
      page.drawText(line, { x: textX, y: ly - 10, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
      ly -= 13;
    }
    for (const line of detailLines) {
      page.drawText(line, { x: textX, y: ly - 9, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      ly -= 12;
    }
    for (const line of valueLines) {
      page.drawText(line, { x: textX, y: ly - 9, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
      ly -= 12;
    }
    for (let i = 0; i < hintLines.length; i++) {
      const col = meta.color;
      page.drawText(hintLines[i], { x: textX, y: ly - 9, size: 9, font: i === 0 ? bold : font, color: rgb(col[0], col[1], col[2]) });
      ly -= 12;
    }
    for (const step of stepLines) {
      for (const line of step) {
        page.drawText(line, { x: textX + 10, y: ly - 9, size: 9, font, color: rgb(0.25, 0.25, 0.3) });
        ly -= 12;
      }
    }
    y -= rowH + 4;
  };

  // Totals
  const totals = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const s of report.sections) for (const c of s.checks) totals[c.status]++;
  const totalChecks = totals.pass + totals.warn + totals.fail + totals.info;

  // Priority issues (fails first, then warns), keep top ones.
  const priority: { section: string; check: Check }[] = [];
  for (const s of report.sections) for (const c of s.checks) if (c.status === "fail") priority.push({ section: s.title, check: c });
  for (const s of report.sections) for (const c of s.checks) if (c.status === "warn") priority.push({ section: s.title, check: c });

  let hostname = report.url;
  try { hostname = new URL(report.url).hostname; } catch { /* keep raw */ }
  const generatedAt = new Date();

  // ============ COVER ============
  mark("Cover & Summary");
  // Full-bleed brand header band
  const headerBandH = 90;
  page.drawRectangle({ x: 0, y: H - headerBandH, width: W, height: headerBandH, color: rgb(0.10, 0.14, 0.25) });
  page.drawRectangle({ x: 0, y: H - headerBandH - 3, width: W, height: 3, color: rgb(0.30, 0.55, 0.95) });
  page.drawText("SEO AUDIT TOOL", { x: M, y: H - 34, size: 10, font: bold, color: rgb(0.65, 0.75, 0.95) });
  page.drawText("SEO Audit Report", { x: M, y: H - 66, size: 26, font: bold, color: rgb(1, 1, 1) });
  const dateTag = generatedAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const dtW = font.widthOfTextAtSize(dateTag, 10);
  page.drawText(dateTag, { x: W - M - dtW, y: H - 34, size: 10, font, color: rgb(0.75, 0.82, 0.95) });
  y = H - headerBandH - 28;

  // Domain + URL
  page.drawText(sanitize(hostname), { x: M, y: y - 20, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 26;
  {
    const urlSize = 10;
    const urlLines = wrap(report.url, font, urlSize, W - M * 2);
    for (const line of urlLines.slice(0, 2)) {
      page.drawText(line, { x: M, y: y - urlSize, size: urlSize, font, color: rgb(0.35, 0.35, 0.5) });
      y -= urlSize + 3;
    }
  }
  y -= 18;

  // Big score panel
  const oc = scoreColor(report.overall_score);
  const panelH = 110;
  const panelY = y - panelH;
  page.drawRectangle({ x: M, y: panelY, width: W - M * 2, height: panelH, color: rgb(0.98, 0.98, 1), borderColor: rgb(0.88, 0.88, 0.92), borderWidth: 0.5 });
  // Left: big number
  const scoreLabel = String(report.overall_score);
  const scoreSize = 56;
  page.drawText(scoreLabel, { x: M + 24, y: panelY + 30, size: scoreSize, font: bold, color: rgb(oc[0], oc[1], oc[2]) });
  const slW = bold.widthOfTextAtSize(scoreLabel, scoreSize);
  page.drawText("/ 100", { x: M + 24 + slW + 6, y: panelY + 34, size: 14, font, color: rgb(0.5, 0.5, 0.55) });
  page.drawText("Overall Health", { x: M + 24, y: panelY + panelH - 22, size: 10, font: bold, color: rgb(0.4, 0.4, 0.5) });
  page.drawText(grade(report.overall_score).toUpperCase(), { x: M + 24, y: panelY + 14, size: 11, font: bold, color: rgb(oc[0], oc[1], oc[2]) });
  // Right: quick metadata
  const metaX = M + (W - M * 2) * 0.55;
  const metaRows: [string, string][] = [
    ["Audited",  new Date(report.fetched_at).toLocaleString()],
    ["HTTP",     `${report.meta.status_code}  ·  ${report.meta.duration_ms}ms  ·  ${(report.meta.bytes/1024).toFixed(1)} KB`],
    ["Checks",   `${totalChecks} total  ·  ${totals.fail} failing  ·  ${totals.warn} warnings`],
    ["Generated by", "SEO Audit Tool"],
  ];
  let mry = panelY + panelH - 22;
  for (const [k, v] of metaRows) {
    page.drawText(k, { x: metaX, y: mry, size: 8, font: bold, color: rgb(0.45, 0.45, 0.55) });
    page.drawText(sanitize(v), { x: metaX, y: mry - 12, size: 9, font, color: rgb(0.15, 0.15, 0.2) });
    mry -= 24;
  }
  y = panelY - 20;

  // At-a-glance cards row (on cover)
  const cardsY = y;
  const gap = 10;
  const cardW = (W - M * 2 - gap * 3) / 4;
  const cardH = 60;
  const drawCard = (i: number, label: string, value: string, color: [number, number, number]) => {
    const x = M + i * (cardW + gap);
    page.drawRectangle({ x, y: cardsY - cardH, width: cardW, height: cardH, borderColor: rgb(0.88, 0.88, 0.9), borderWidth: 0.5, color: rgb(0.985, 0.985, 0.99) });
    // Colored top accent
    page.drawRectangle({ x, y: cardsY - 3, width: cardW, height: 3, color: rgb(color[0], color[1], color[2]) });
    page.drawText(label.toUpperCase(), { x: x + 12, y: cardsY - 20, size: 8, font: bold, color: rgb(0.45, 0.45, 0.5) });
    page.drawText(value, { x: x + 12, y: cardsY - 48, size: 22, font: bold, color: rgb(color[0], color[1], color[2]) });
  };
  drawCard(0, "Passing", String(totals.pass), [0.2, 0.6, 0.3]);
  drawCard(1, "Warnings", String(totals.warn), [0.85, 0.6, 0.1]);
  drawCard(2, "Failing", String(totals.fail), [0.8, 0.2, 0.2]);
  drawCard(3, "Info", String(totals.info), [0.4, 0.4, 0.4]);
  y = cardsY - cardH - 10;

  // Score distribution: stacked segmented bar with legend.
  if (totalChecks > 0) {
    ensure(60);
    page.drawText("Check status distribution", { x: M, y: y - 10, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
    const distBarW = W - M * 2;
    const distBarH = 14;
    const segs: { n: number; color: [number, number, number]; label: string }[] = [
      { n: totals.pass, color: [0.2, 0.6, 0.3], label: "Pass" },
      { n: totals.warn, color: [0.85, 0.6, 0.1], label: "Warn" },
      { n: totals.fail, color: [0.8, 0.2, 0.2], label: "Fail" },
      { n: totals.info, color: [0.55, 0.55, 0.6], label: "Info" },
    ];
    let sx = M;
    for (const s of segs) {
      if (s.n <= 0) continue;
      const w = distBarW * (s.n / totalChecks);
      page.drawRectangle({ x: sx, y: y - distBarH, width: w, height: distBarH, color: rgb(s.color[0], s.color[1], s.color[2]) });
      sx += w;
    }
    y -= distBarH + 6;
    let lx = M;
    for (const s of segs) {
      const pct = Math.round((s.n / totalChecks) * 100);
      page.drawRectangle({ x: lx, y: y - 8, width: 8, height: 8, color: rgb(s.color[0], s.color[1], s.color[2]) });
      const lbl = `${s.label} ${s.n} (${pct}%)`;
      page.drawText(lbl, { x: lx + 12, y: y - 8, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
      lx += 12 + font.widthOfTextAtSize(lbl, 9) + 14;
    }
    y -= 16;
  }

  // Move "How to read" + status legend onto its own page for a cleaner cover.
  newPage();
  mark("How to read this report");
  text("How to read this report", { size: 18, bold: true });
  spacer(4);
  text("A quick guide to the labels, scores, and colour coding used throughout the report.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(10);
  text("Scoring", { size: 12, bold: true });
  spacer(2);
  text("Each check is tagged PASS (looks good), WARN (worth improving), FAIL (fix soon) or INFO (context only). Sections are scored 0-100 - 80+ is good, 60-79 needs work, below 60 is a serious problem.", { size: 9, color: [0.35, 0.35, 0.35] });
  spacer(10);
  // Shared status legend — same totals as the segmented chart, so counts + % stay in sync.
  const drawStatusLegend = (title: string) => {
    const items: { key: keyof typeof totals; label: string; desc: string; color: [number, number, number] }[] = [
      { key: "pass", label: "PASS", desc: "Check meets best practice.",       color: [0.2, 0.6, 0.3] },
      { key: "warn", label: "WARN", desc: "Worth improving soon.",             color: [0.85, 0.6, 0.1] },
      { key: "fail", label: "FAIL", desc: "Fix as soon as possible.",          color: [0.8, 0.2, 0.2] },
      { key: "info", label: "INFO", desc: "Context only, no action required.", color: [0.55, 0.55, 0.6] },
    ];
    const rowH = 18; // roomy enough to stay legible when zoomed out
    ensure(items.length * rowH + 24);
    page.drawText(title, { x: M, y: y - 11, size: 11, font: bold, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
    const swatch = 12;
    for (const it of items) {
      const n = totals[it.key];
      const pct = totalChecks ? Math.round((n / totalChecks) * 100) : 0;
      page.drawRectangle({ x: M, y: y - swatch, width: swatch, height: swatch, color: rgb(it.color[0], it.color[1], it.color[2]) });
      page.drawText(it.label, { x: M + swatch + 8, y: y - swatch + 2, size: 10, font: bold, color: rgb(it.color[0], it.color[1], it.color[2]) });
      const countStr = `${n} (${pct}%)`;
      const cw = bold.widthOfTextAtSize(countStr, 10);
      page.drawText(countStr, { x: M + swatch + 52, y: y - swatch + 2, size: 10, font: bold, color: rgb(0.15, 0.15, 0.15) });
      page.drawText(it.desc, { x: M + swatch + 52 + cw + 12, y: y - swatch + 2, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      y -= rowH;
    }
    spacer(2);
    text("Footnote: PASS = meets SEO best practice, WARN = worth improving, FAIL = fix soon (directly hurts rankings), INFO = context only, no action required.", { size: 8, color: [0.45, 0.45, 0.5] });
  };
  drawStatusLegend("Status colour key");

  // ============ PRIORITY ISSUES ============
  if (priority.length) {
    newPage();
    mark("Priority Issues");
    text("Priority Issues", { size: 18, bold: true });
    spacer(2);
    text("The most impactful items to address first, ranked by severity.", { size: 10, color: [0.35, 0.35, 0.35] });
    spacer(8);
    priority.slice(0, 12).forEach((p, i) => {
      const meta = statusMeta(p.check.status);
      ensure(40);
      const startPage = page;
      const startY = y + 4;
      // Card background
      const cardTopY = y + 6;
      // Number + title row
      const numStr = `${i + 1}.`;
      const numW = bold.widthOfTextAtSize(numStr, 11);
      page.drawText(numStr, { x: M + 10, y: y - 11, size: 11, font: bold, color: rgb(0.3, 0.3, 0.3) });
      const titleX = M + 10 + numW + 6;
      const badgeW = drawBadge(titleX, y, meta.label, meta.color, meta.bg);
      const secX = titleX + badgeW + 6;
      page.drawText(sanitize(p.section), { x: secX, y: y - 11, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      y -= 18;
      const labelLines = wrap(p.check.label, bold, 11, W - M - titleX);
      for (const line of labelLines) {
        ensure(14);
        page.drawText(line, { x: titleX, y: y - 11, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) });
        y -= 14;
      }
      if (p.check.detail) {
        const detailLines = wrap(p.check.detail, font, 9, W - M - titleX);
        for (const line of detailLines) {
          ensure(12);
          page.drawText(line, { x: titleX, y: y - 9, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
          y -= 12;
        }
      }
      // How to fix: summary + 3-5 step checklist + rule ID + jump link to Detailed Findings.
      {
        const g = fixHint(p.check);
        const maxW = W - M - titleX;
        const summary = wrap(`How to fix (rule: ${p.check.id}): ${g.summary}`, font, 9, maxW);
        for (let i = 0; i < summary.length; i++) {
          ensure(12);
          page.drawText(summary[i], { x: titleX, y: y - 9, size: 9, font: i === 0 ? bold : font, color: rgb(meta.color[0], meta.color[1], meta.color[2]) });
          y -= 12;
        }
        for (const step of g.steps) {
          const stepLines = wrap(`- ${step}`, font, 9, maxW - 10);
          for (const line of stepLines) {
            ensure(12);
            page.drawText(line, { x: titleX + 10, y: y - 9, size: 9, font, color: rgb(0.25, 0.25, 0.3) });
            y -= 12;
          }
        }
        // "See full detail" jump link
        const jump = "See full detail in Detailed Findings ->";
        ensure(12);
        page.drawText(jump, { x: titleX, y: y - 9, size: 9, font: bold, color: rgb(0.15, 0.35, 0.75) });
        const jw = bold.widthOfTextAtSize(jump, 9);
        pendingCrossLinks.push({
          page,
          rect: [titleX, y - 11, titleX + jw + 2, y + 1],
          check: p.check,
        });
        y -= 12;
      }
      // Register whole item as clickable → Detailed Findings row.
      if (startPage === page) {
        // Draw the card frame around the whole item now that height is known.
        const cardH = cardTopY - (y + 4);
        startPage.drawRectangle({
          x: M, y: y + 4, width: W - M * 2, height: cardH,
          borderColor: rgb(0.9, 0.9, 0.93), borderWidth: 0.5,
        });
        // Left status accent bar
        startPage.drawRectangle({
          x: M, y: y + 4, width: 3, height: cardH,
          color: rgb(meta.color[0], meta.color[1], meta.color[2]),
        });
        pendingCrossLinks.push({
          page: startPage,
          rect: [M, y + 4, W - M, startY],
          check: p.check,
        });
      }
      spacer(12);
    });
  }

  // ============ SECTION SCORECARD ============
  newPage();
  mark("Section Scorecard");
  text("Section Scorecard", { size: 18, bold: true });
  spacer(2);
  text("How each area of the page performs. Lower scores are pulling the overall grade down.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);
  drawStatusLegend("Status colour key (matches the chart totals)");
  spacer(6);
  rule();
  const sorted = report.sections.slice().sort((a, b) => a.score - b.score);
  for (const s of sorted) {
    ensure(32);
    const col = scoreColor(s.score);
    // Score chip on the right
    const scoreStr = `${s.score}/100`;
    const sw = bold.widthOfTextAtSize(scoreStr, 11);
    page.drawText(sanitize(s.title), { x: M, y: y - 12, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(scoreStr, { x: W - M - sw, y: y - 12, size: 11, font: bold, color: rgb(col[0], col[1], col[2]) });
    y -= 18;
    // Progress bar
    const barW = W - M * 2;
    page.drawRectangle({ x: M, y: y - 5, width: barW, height: 5, color: rgb(0.92, 0.92, 0.94) });
    page.drawRectangle({ x: M, y: y - 5, width: Math.max(2, barW * (s.score / 100)), height: 5, color: rgb(col[0], col[1], col[2]) });
    y -= 10;
    const fails = s.checks.filter(c => c.status === "fail").length;
    const warns = s.checks.filter(c => c.status === "warn").length;
    page.drawText(`${s.checks.length} checks  ·  ${fails} failing  ·  ${warns} warnings  ·  ${grade(s.score)}`, {
      x: M, y: y - 9, size: 9, font, color: rgb(0.5, 0.5, 0.5),
    });
    y -= 18;
  }

  // ============ DETAILED FINDINGS ============
  newPage();
  mark("Detailed Findings");
  text("Detailed Findings", { size: 18, bold: true });
  spacer(2);
  text("Every check we ran, grouped by section.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);
  for (const s of report.sections) {
    sectionHeader(s.title, s.score);
    for (const c of s.checks) drawCheck(c);
    spacer(8);
  }

  // Wire Priority Issues cross-links to their Detailed Findings anchors.
  for (const link of pendingCrossLinks) {
    const target = checkAnchors.get(link.check);
    if (!target) continue;
    addInternalLink(link.page, link.rect, target.page.ref, target.y);
  }

  // ============ AI RECOMMENDATIONS ============
  if (recs.length) {
    newPage();
    mark("AI Recommendations");
    text("AI Recommendations", { size: 18, bold: true });
    spacer(2);
    text("Concrete next actions generated for this page.", { size: 10, color: [0.35, 0.35, 0.35] });
    spacer(8);
    for (const r of recs) {
      ensure(40);
      text(r.title, { size: 13, bold: true });
      spacer(2);
      for (const rec of r.recommendations) {
        ensure(16);
        // bullet
        page.drawCircle({ x: M + 4, y: y - 5, size: 2, color: rgb(0.35, 0.35, 0.75) });
        const lines = wrap(rec, font, 10, W - M * 2 - 14);
        for (let i = 0; i < lines.length; i++) {
          ensure(13);
          page.drawText(lines[i], { x: M + 14, y: y - 10, size: 10, font, color: rgb(0.15, 0.15, 0.15) });
          y -= 13;
        }
        spacer(2);
      }
      spacer(8);
      rule();
    }
  }

  // ============ APPENDIX ============
  newPage();
  mark("Appendix");
  text("Appendix", { size: 18, bold: true });
  spacer(2);
  text("Scope, run metadata, and guidance on how to interpret this report.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(10);

  text("Audit scope", { size: 13, bold: true });
  spacer(2);
  text("This audit is a single-page technical and on-page SEO review of the URL below. It fetches the page server-side (no JavaScript rendering), inspects the HTML response, and evaluates it against dozens of on-page, technical, content, accessibility, and social-metadata best practices. It does not crawl the rest of the site, does not measure real-user performance, and does not include off-site signals such as backlinks unless a dedicated External Signals section is present.", { size: 10, color: [0.2, 0.2, 0.25] });
  spacer(8);

  text("Run metadata", { size: 13, bold: true });
  spacer(4);
  const metaLines: [string, string][] = [
    ["Target URL",          report.url],
    ["Final URL",           report.final_url || report.url],
    ["Domain",              hostname],
    ["Audited at",          new Date(report.fetched_at).toLocaleString()],
    ["Report generated",    generatedAt.toLocaleString()],
    ["HTTP status",         String(report.meta.status_code)],
    ["Response time",       `${report.meta.duration_ms} ms`],
    ["Response size",       `${(report.meta.bytes / 1024).toFixed(1)} KB`],
    ["Overall score",       `${report.overall_score} / 100 (${grade(report.overall_score)})`],
    ["Checks evaluated",    `${totalChecks} total — ${totals.pass} pass, ${totals.warn} warn, ${totals.fail} fail, ${totals.info} info`],
    ["Sections",            String(report.sections.length)],
    ["Generated by",        "SEO Audit Tool"],
  ];
  const keyColW = 130;
  for (const [k, v] of metaLines) {
    ensure(14);
    page.drawText(k, { x: M, y: y - 10, size: 9, font: bold, color: rgb(0.4, 0.4, 0.5) });
    const vLines = wrap(v, font, 9, W - M * 2 - keyColW);
    let first = true;
    for (const line of vLines) {
      if (!first) ensure(12);
      page.drawText(line, { x: M + keyColW, y: y - 10, size: 9, font, color: rgb(0.15, 0.15, 0.2) });
      y -= 12;
      first = false;
    }
    y -= 2;
  }
  spacer(8);

  text("How to interpret the results", { size: 13, bold: true });
  spacer(2);
  text("Use the report in this order for the fastest impact:", { size: 10, color: [0.2, 0.2, 0.25] });
  spacer(4);
  const steps = [
    "Start with the Priority Issues — these are your highest-impact fixes, ranked by severity. Each item links to its full entry in Detailed Findings.",
    "Review the Section Scorecard to see which areas are pulling your overall score down. Tackle the lowest-scoring sections first.",
    "Work through Detailed Findings section by section. Every check includes a plain-language 'How to fix' summary and a 3–5 step checklist tied to the rule ID.",
    "Use the AI Recommendations for tailored, page-specific next actions once the mechanical fixes are in.",
    "Re-run the audit after deploying changes to confirm each fix flips from FAIL/WARN to PASS.",
  ];
  for (const s of steps) {
    ensure(14);
    page.drawCircle({ x: M + 3, y: y - 5, size: 2, color: rgb(0.35, 0.35, 0.75) });
    const lines = wrap(s, font, 10, W - M * 2 - 14);
    for (const line of lines) {
      ensure(13);
      page.drawText(line, { x: M + 14, y: y - 10, size: 10, font, color: rgb(0.15, 0.15, 0.2) });
      y -= 13;
    }
    spacer(3);
  }
  spacer(6);

  text("Scoring model", { size: 13, bold: true });
  spacer(2);
  text("Each check returns PASS, WARN, FAIL, or INFO. Section scores are the weighted share of passing/warning checks in that section, expressed 0–100. The overall score is the average of the section scores. 80+ is good, 60–79 needs work, below 60 is a serious problem. INFO checks are context only and do not affect the score.", { size: 10, color: [0.2, 0.2, 0.25] });
  spacer(8);

  text("Limitations", { size: 13, bold: true });
  spacer(2);
  text("The audit fetches raw HTML and does not execute client-side JavaScript, so single-page apps that render content in the browser may appear thinner than they are to a real user. Rankings, traffic, and backlinks are not measured here; when included, external signals come from third-party APIs and reflect their most recent available data, which can lag by hours or days. Treat findings as prioritised guidance, not guarantees — Google's ranking systems weigh many factors this report does not attempt to measure.", { size: 10, color: [0.2, 0.2, 0.25] });
  spacer(8);

  text("Glossary", { size: 13, bold: true });
  spacer(2);
  const glossary: [string, string][] = [
    ["PASS / WARN / FAIL / INFO", "Result of an individual check. Only WARN and FAIL are actionable."],
    ["Section score",             "0–100 rating for a single area (e.g. Meta, Content, Performance)."],
    ["Overall score",             "Average of the section scores for this page."],
    ["Rule ID",                   "The short identifier next to each 'How to fix' line (e.g. title, canonical, h1). Use it to look up the check in Detailed Findings."],
    ["Priority Issue",            "A FAIL or WARN check chosen for the highest-impact fix list on the summary page."],
  ];
  for (const [k, v] of glossary) {
    ensure(28);
    text(k, { size: 10, bold: true });
    text(v, { size: 9, color: [0.35, 0.35, 0.4] });
    spacer(3);
  }

  // ============ TABLE OF CONTENTS (inserted after cover) ============
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

  const allPagesForToc = doc.getPages();
  for (const entry of toc) {
    if (ty - 22 < M + FOOTER_Y) {
      tp = makeTocPage();
      ty = H - M;
      drawTocText("Contents (continued)", 16, true);
      ty -= 26;
    }
    const pageNum = allPagesForToc.indexOf(entry.page) + 1;
    const entrySize = 12;
    const rowY = ty - entrySize;
    tp.drawText(sanitize(entry.title), { x: M, y: rowY, size: entrySize, font: bold, color: rgb(0.15, 0.35, 0.75) });
    const pageStr = String(pageNum);
    const pageW = font.widthOfTextAtSize(pageStr, entrySize);
    tp.drawText(pageStr, { x: W - M - pageW, y: rowY, size: entrySize, font, color: rgb(0.3, 0.3, 0.3) });
    const titleW = bold.widthOfTextAtSize(sanitize(entry.title), entrySize);
    const dotsStartX = M + titleW + 6;
    const dotsEndX = W - M - pageW - 6;
    if (dotsEndX > dotsStartX) {
      const dotW = font.widthOfTextAtSize(".", entrySize);
      const dotCount = Math.floor((dotsEndX - dotsStartX) / (dotW + 1));
      tp.drawText(".".repeat(Math.max(0, dotCount)), { x: dotsStartX, y: rowY, size: entrySize, font, color: rgb(0.7, 0.7, 0.7) });
    }
    addInternalLink(tp, [M, rowY - 2, W - M, rowY + entrySize + 2], entry.page.ref, entry.targetY);
    ty -= entrySize + 12;
  }

  // ============ HEADERS / FOOTERS / PAGE NUMBERS ============
  const finalPages = doc.getPages();
  const total = finalPages.length;
  const headerText = `SEO Audit — ${hostname}`;
  const footerLeft = `Generated ${generatedAt.toLocaleDateString()} by SEO Audit Tool`;
  for (let i = 0; i < total; i++) {
    const p = finalPages[i];
    if (i > 0) {
      p.drawText(sanitize(headerText), { x: M, y: HEADER_Y, size: 8, font, color: rgb(0.55, 0.55, 0.6) });
      if (tocPages.includes(p)) {
        const lbl = "Contents";
        const wLbl = font.widthOfTextAtSize(lbl, 8);
        p.drawText(lbl, { x: W - M - wLbl, y: HEADER_Y, size: 8, font, color: rgb(0.55, 0.55, 0.6) });
      }
      p.drawLine({ start: { x: M, y: HEADER_Y - 4 }, end: { x: W - M, y: HEADER_Y - 4 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.88) });
    }
    p.drawLine({ start: { x: M, y: FOOTER_Y + 12 }, end: { x: W - M, y: FOOTER_Y + 12 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.88) });
    p.drawText(sanitize(footerLeft), { x: M, y: FOOTER_Y, size: 8, font, color: rgb(0.55, 0.55, 0.6) });
    const pageStr = `Page ${i + 1} of ${total}`;
    const wPg = font.widthOfTextAtSize(pageStr, 8);
    p.drawText(pageStr, { x: W - M - wPg, y: FOOTER_Y, size: 8, font, color: rgb(0.55, 0.55, 0.6) });
  }

  return await doc.save();
}

interface CrawlPage { url: string; status: number; title: string; description: string; h1_count: number; word_count: number; bytes: number; duration_ms: number; images_missing_alt: number; noindex: boolean; }
interface CrawlIssue { url: string; severity: "high"|"medium"|"low"; message: string; }

// ============= MEGA AUDIT PDF =============
interface MegaCheck { id: string; label: string; status: "pass"|"warn"|"fail"|"info"; detail?: string; value?: string | number | null }
interface MegaSection { id: string; title: string; score: number; checks: MegaCheck[] }
interface MegaPageReport { url: string; final_url: string; overall_score: number; sections: MegaSection[] }
interface MegaCompetitor { url: string; overall_score: number | null; semrush?: MegaSection | null; ai?: MegaSection | null; error?: string }
interface MegaResults {
  target_url: string;
  competitor_url?: string | null;
  target_keyword?: string | null;
  finished_at: string;
  page: MegaPageReport;
  site: { summary: { overall_score: number; pages_audited: number; pages_failed: number; avg_by_section: Record<string, number>; issue_counts: { high: number; medium: number; low: number }; top_problems: { message: string; count: number; severity: "high"|"medium"|"low" }[] }; pages: { url: string; overall_score: number | null }[]; issues: { url: string; severity: "high"|"medium"|"low"; message: string }[] };
  site_signals: MegaSection[];
  competitor?: MegaCompetitor | null;
  mega_score: number;
  score_breakdown: { label: string; score: number; weight: number }[];
  priority_actions: { severity: "high"|"medium"|"low"; message: string; count?: number; source: string }[];
}

export async function buildMegaAuditPdf(r: MegaResults): Promise<Uint8Array> {
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
    const asc = ascentOf(f, size);
    const lh = lineAdvanceOf(f, size);
    for (const line of wrap(t, f, size, W - M * 2)) {
      ensure(lh);
      page.drawText(line, { x: M, y: y - asc, size, font: f, color: rgb(c[0], c[1], c[2]) });
      y -= lh;
    }
  };
  const spacer = (n = 6) => { y -= n; };
  const rule = () => { ensure(6); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) }); y -= 8; };
  const scoreColor = (n: number | null | undefined): [number, number, number] => {
    const v = n ?? 0;
    return v >= 80 ? [0.2, 0.6, 0.3] : v >= 60 ? [0.85, 0.6, 0.1] : [0.8, 0.2, 0.2];
  };
  const sevColor = (sev: string): [number, number, number] => sev === "high" ? [0.8, 0.2, 0.2] : sev === "medium" ? [0.85, 0.6, 0.1] : [0.5, 0.5, 0.5];
  const sevLabel = (sev: string) => sev.toUpperCase();
  const renderSection = (s: MegaSection) => {
    ensure(40);
    text(`${s.title}   (${s.score}/100)`, { size: 13, bold: true, color: scoreColor(s.score) });
    spacer(2);
    for (const c of s.checks) {
      const tag = c.status === "pass" ? "[PASS]" : c.status === "warn" ? "[WARN]" : c.status === "fail" ? "[FAIL]" : "[INFO]";
      const col: [number, number, number] = c.status === "pass" ? [0.2, 0.6, 0.3] : c.status === "warn" ? [0.85, 0.6, 0.1] : c.status === "fail" ? [0.8, 0.2, 0.2] : [0.4, 0.4, 0.4];
      text(`${tag} ${c.label}${c.value != null && c.value !== "" ? ` - ${String(c.value).slice(0, 140)}` : ""}`, { size: 10, bold: true, color: col });
      if (c.detail) text(c.detail, { size: 9, color: [0.35, 0.35, 0.35] });
      spacer(2);
    }
    spacer(4);
    rule();
  };

  // Cover
  text("Mega SEO Audit Report", { size: 24, bold: true });
  spacer(6);
  text(r.target_url, { size: 12, color: [0.35, 0.35, 0.35] });
  text(`Finished ${new Date(r.finished_at).toLocaleString()}`, { size: 9, color: [0.5, 0.5, 0.5] });
  if (r.competitor_url) text(`Competitor: ${r.competitor_url}`, { size: 10, color: [0.35, 0.35, 0.35] });
  if (r.target_keyword) text(`Target keyword: ${r.target_keyword}`, { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(12);
  rule();
  text("Mega Score", { size: 12, bold: true, color: [0.35, 0.35, 0.35] });
  spacer(2);
  text(`${r.mega_score} / 100`, { size: 28, bold: true, color: scoreColor(r.mega_score) });
  spacer(10);

  text("Score Breakdown", { size: 13, bold: true });
  spacer(2);
  for (const s of r.score_breakdown) {
    text(`- ${s.label}: ${s.score}/100 (weight ${(s.weight * 100).toFixed(0)}%)`, { size: 10, color: scoreColor(s.score) });
  }
  spacer(8);
  rule();

  // Priority actions
  ensure(60);
  text("Priority Action Plan", { size: 18, bold: true });
  spacer(2);
  text("Ranked by severity across the homepage, whole-site crawl and external signals.", { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(6);
  if (!r.priority_actions.length) {
    text("No priority issues found. Nice work.", { size: 11, color: [0.2, 0.6, 0.3] });
  } else {
    r.priority_actions.slice(0, 40).forEach((a, i) => {
      ensure(34);
      text(`${i + 1}. [${sevLabel(a.severity)}] ${a.message}`, { size: 11, bold: true, color: sevColor(a.severity) });
      text(`   Source: ${a.source}${a.count ? ` · Affects ${a.count} page${a.count === 1 ? "" : "s"}` : ""}`, { size: 9, color: [0.4, 0.4, 0.4] });
      spacer(4);
    });
  }

  // Homepage audit
  newPage();
  text("Homepage Audit", { size: 18, bold: true });
  spacer(2);
  text(`${r.page.url} - overall ${r.page.overall_score}/100`, { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);
  for (const s of r.page.sections) renderSection(s);

  // Whole-site summary
  newPage();
  text("Whole-site Audit", { size: 18, bold: true });
  spacer(2);
  const ss = r.site.summary;
  text(`Site score: ${ss.overall_score}/100 · ${ss.pages_audited} pages audited · ${ss.pages_failed} failed`, { size: 10, color: [0.35, 0.35, 0.35] });
  text(`Issues: ${ss.issue_counts.high} high, ${ss.issue_counts.medium} medium, ${ss.issue_counts.low} low`, { size: 10, color: [0.35, 0.35, 0.35] });
  spacer(8);
  text("Section averages", { size: 13, bold: true });
  spacer(2);
  for (const [id, sc] of Object.entries(ss.avg_by_section)) {
    text(`- ${id}: ${sc}/100`, { size: 10, color: scoreColor(sc) });
  }
  spacer(6);
  if (ss.top_problems?.length) {
    text("Top recurring problems", { size: 13, bold: true });
    spacer(2);
    for (const p of ss.top_problems.slice(0, 20)) {
      text(`[${sevLabel(p.severity)}] ${p.message} - ${p.count} page${p.count === 1 ? "" : "s"}`, { size: 10, color: sevColor(p.severity) });
    }
  }

  // External signals
  if (r.site_signals?.length) {
    newPage();
    text("External Signals", { size: 18, bold: true });
    spacer(2);
    text("PageSpeed, Google Search Console, Semrush and AI visibility.", { size: 10, color: [0.35, 0.35, 0.35] });
    spacer(6);
    for (const s of r.site_signals) renderSection(s);
  }

  // Competitor
  if (r.competitor) {
    newPage();
    text("Competitor Comparison", { size: 18, bold: true });
    spacer(2);
    text(`${r.competitor.url}`, { size: 10, color: [0.35, 0.35, 0.35] });
    spacer(6);
    const gap = r.competitor.overall_score == null ? null : r.page.overall_score - r.competitor.overall_score;
    text(`Your score: ${r.page.overall_score}   ·   Competitor: ${r.competitor.overall_score ?? "-"}   ·   Gap: ${gap == null ? "-" : (gap > 0 ? "+" : "") + gap}`, { size: 11, bold: true });
    spacer(6);
    if (r.competitor.error) text(`Competitor audit error: ${r.competitor.error}`, { size: 10, color: [0.8, 0.2, 0.2] });
    if (r.competitor.semrush) renderSection(r.competitor.semrush);
    if (r.competitor.ai) renderSection(r.competitor.ai);
  }

  return await doc.save();
}

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