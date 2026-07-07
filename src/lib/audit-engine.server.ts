// Server-only audit engine: crawls the target URL and computes SEO signals.

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  value?: string | number | null;
}
export interface Section {
  id: string;
  title: string;
  score: number;      // 0-100
  checks: Check[];
  data?: Record<string, unknown>;
}
export interface AuditReport {
  url: string;
  final_url: string;
  fetched_at: string;
  overall_score: number;
  sections: Section[];
  meta: {
    status_code: number;
    duration_ms: number;
    bytes: number;
    content_type: string | null;
  };
}

const UA = "SEOAuditToolBot/1.0 (+https://lovable.app)";

async function safeFetch(url: string, init: RequestInit = {}) {
  const { assertPublicHttpUrl } = await import("./net-guard.server");
  assertPublicHttpUrl(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,*/*", ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

function scoreFromChecks(checks: Check[]): number {
  const weighted = checks.filter(c => c.status !== "info");
  if (!weighted.length) return 100;
  let total = 0;
  for (const c of weighted) total += c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0;
  return Math.round((total / weighted.length) * 100);
}

function textOf(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m; while ((m = re.exec(html))) out.push(m[1].replace(/<[^>]+>/g, "").trim());
  return out;
}

function attr(html: string, tag: string, name: string, attrName: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\b${name}\\s*=\\s*["']([^"']*)["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  if (attrName === name) return m[1];
  const full = m[0];
  const re2 = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']*)["']`, "i");
  const m2 = full.match(re2);
  return m2 ? m2[1] : null;
}

function all(html: string, re: RegExp): RegExpMatchArray[] {
  const arr: RegExpMatchArray[] = [];
  let m; while ((m = re.exec(html))) arr.push(m);
  return arr;
}

export async function runAudit(rawUrl: string): Promise<AuditReport> {
  const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  const started = Date.now();
  const res = await safeFetch(url.toString());
  const html = await res.text();
  const duration = Date.now() - started;
  const finalUrl = res.url || url.toString();
  const origin = new URL(finalUrl).origin;

  // parallel side fetches
  const [robotsRes, sitemapRes, faviconRes, notFoundRes] = await Promise.allSettled([
    safeFetch(`${origin}/robots.txt`),
    safeFetch(`${origin}/sitemap.xml`),
    safeFetch(`${origin}/favicon.ico`),
    safeFetch(`${origin}/this-page-must-not-exist-${Date.now()}`),
  ]);

  const sections: Section[] = [];

  // ==== Meta tags ====
  const title = textOf(html, "title")[0] || "";
  const desc = attr(html, "meta", "name", "content") && html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const twCard = html.match(/<meta[^>]+name=["']twitter:card["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1] || "";
  const viewport = html.match(/<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const charset = html.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)?.[1] || "";
  const lang = html.match(/<html[^>]+lang=["']([^"']*)["']/i)?.[1] || "";
  const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";

  const metaChecks: Check[] = [
    { id: "title", label: "Title tag", status: title ? (title.length > 60 ? "warn" : title.length < 20 ? "warn" : "pass") : "fail", value: title, detail: `${title.length} chars` },
    { id: "desc", label: "Meta description", status: desc ? (desc.length > 160 ? "warn" : desc.length < 50 ? "warn" : "pass") : "fail", value: desc, detail: `${desc.length} chars` },
    { id: "canonical", label: "Canonical URL", status: canonical ? "pass" : "warn", value: canonical },
    { id: "og:title", label: "Open Graph title", status: ogTitle ? "pass" : "warn", value: ogTitle },
    { id: "og:image", label: "Open Graph image", status: ogImage ? "pass" : "warn", value: ogImage },
    { id: "tw:card", label: "Twitter card", status: twCard ? "pass" : "warn", value: twCard },
    { id: "viewport", label: "Viewport meta", status: viewport ? "pass" : "fail", value: viewport },
    { id: "charset", label: "Charset declaration", status: charset ? "pass" : "fail", value: charset },
    { id: "lang", label: "HTML lang attribute", status: lang ? "pass" : "warn", value: lang },
    { id: "robots-meta", label: "Robots meta", status: /noindex/i.test(robotsMeta) ? "fail" : "pass", value: robotsMeta || "(default)" },
  ];
  sections.push({ id: "meta", title: "Meta Tags", checks: metaChecks, score: scoreFromChecks(metaChecks), data: { title, desc, canonical } });

  // ==== Headings & on-page ====
  const h1s = textOf(html, "h1");
  const h2s = textOf(html, "h2");
  const h3s = textOf(html, "h3");
  const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = bodyText ? bodyText.split(/\s+/) : [];
  const wordCount = words.length;
  const onpageChecks: Check[] = [
    { id: "h1-count", label: "Single H1 tag", status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn", detail: `${h1s.length} found`, value: h1s[0] },
    { id: "h2-count", label: "H2 tags present", status: h2s.length > 0 ? "pass" : "warn", detail: `${h2s.length} found` },
    { id: "h3-count", label: "H3 tags", status: h3s.length > 0 ? "pass" : "info", detail: `${h3s.length} found` },
    { id: "word-count", label: "Content length", status: wordCount > 300 ? "pass" : wordCount > 100 ? "warn" : "fail", detail: `${wordCount} words` },
  ];
  sections.push({ id: "onpage", title: "On-page Optimization", checks: onpageChecks, score: scoreFromChecks(onpageChecks), data: { h1s, h2s, h3s, wordCount } });

  // ==== Content / keyword density ====
  const freq: Record<string, number> = {};
  const stop = new Set("a an the and or of to in for on with is are was were be been being it its as by at from this that these those you your we our i".split(" "));
  for (const w of words) {
    const k = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k || k.length < 4 || stop.has(k)) continue;
    freq[k] = (freq[k] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0, 15).map(([term,count])=>({ term, count, density: +(count/Math.max(wordCount,1)*100).toFixed(2) }));
  const contentChecks: Check[] = [
    { id: "keyword-diversity", label: "Keyword diversity", status: top.length >= 5 ? "pass" : "warn", detail: `${top.length} unique top terms` },
    { id: "flesch", label: "Flesch reading ease", status: "info", value: fleschReading(bodyText), detail: "60–80 is ideal" },
  ];
  sections.push({ id: "content", title: "Content Optimization", checks: contentChecks, score: scoreFromChecks(contentChecks), data: { top_keywords: top, word_count: wordCount } });

  // ==== Links (internal / external / broken sample) ====
  const linkMatches = all(html, /<a[^>]+href=["']([^"']+)["'][^>]*>/gi);
  const links = linkMatches.map(m => m[1]).filter(h => h && !h.startsWith("javascript:") && !h.startsWith("mailto:") && !h.startsWith("tel:") && !h.startsWith("#"));
  const host = new URL(finalUrl).host;
  const internal: string[] = [], external: string[] = [];
  for (const l of links) {
    try {
      const abs = new URL(l, finalUrl);
      if (abs.host === host) internal.push(abs.toString()); else external.push(abs.toString());
    } catch { /* skip */ }
  }
  const linkChecks: Check[] = [
    { id: "internal-links", label: "Internal links", status: internal.length > 3 ? "pass" : internal.length > 0 ? "warn" : "fail", detail: `${internal.length} links` },
    { id: "external-links", label: "External links", status: external.length > 0 ? "pass" : "info", detail: `${external.length} links` },
  ];
  sections.push({ id: "links", title: "Internal & External Linking", checks: linkChecks, score: scoreFromChecks(linkChecks), data: { internal_sample: internal.slice(0, 25), external_sample: external.slice(0, 25) } });

  // Broken links sample (up to 8 unique)
  const sample = Array.from(new Set([...internal, ...external])).slice(0, 8);
  const results = await Promise.allSettled(sample.map(u => safeFetch(u, { method: "HEAD" }).then(r => ({ u, s: r.status })).catch(() => ({ u, s: 0 }))));
  const broken = results.map(r => r.status === "fulfilled" ? r.value : { u: "", s: 0 }).filter(r => r.u && (r.s === 0 || r.s >= 400));
  const brokenChecks: Check[] = [
    { id: "broken", label: "Broken links (sample)", status: broken.length === 0 ? "pass" : broken.length < 3 ? "warn" : "fail", detail: `${broken.length}/${sample.length} broken in sample` },
  ];
  sections.push({ id: "broken", title: "Broken Links", checks: brokenChecks, score: scoreFromChecks(brokenChecks), data: { broken, sampled: sample.length } });

  // ==== Images / alt text ====
  const imgs = all(html, /<img[^>]*>/gi).map(m => m[0]);
  const imgsWithoutAlt = imgs.filter(t => !/\balt\s*=\s*["'][^"']+["']/i.test(t)).length;
  const imgLazy = imgs.filter(t => /\bloading\s*=\s*["']lazy["']/i.test(t)).length;
  const imgChecks: Check[] = [
    { id: "alt", label: "Images with alt text", status: imgsWithoutAlt === 0 ? "pass" : imgsWithoutAlt < imgs.length/2 ? "warn" : "fail", detail: `${imgs.length - imgsWithoutAlt}/${imgs.length} have alt` },
    { id: "lazy", label: "Lazy-loaded images", status: imgs.length === 0 ? "info" : imgLazy > 0 ? "pass" : "warn", detail: `${imgLazy}/${imgs.length} lazy` },
    { id: "img-count", label: "Total images", status: "info", value: imgs.length },
  ];
  sections.push({ id: "images", title: "Responsive & Image Test", checks: imgChecks, score: scoreFromChecks(imgChecks) });

  // ==== Robots.txt ====
  const robotsChecks: Check[] = [];
  if (robotsRes.status === "fulfilled" && robotsRes.value.ok) {
    const txt = await robotsRes.value.text();
    const disallowAll = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/(?:\s|$)/i.test(txt);
    const hasSitemap = /Sitemap:/i.test(txt);
    robotsChecks.push({ id: "robots-exists", label: "robots.txt exists", status: "pass" });
    robotsChecks.push({ id: "robots-open", label: "robots.txt does not block all", status: disallowAll ? "fail" : "pass" });
    robotsChecks.push({ id: "robots-sitemap", label: "Sitemap directive present", status: hasSitemap ? "pass" : "warn" });
  } else {
    robotsChecks.push({ id: "robots-exists", label: "robots.txt exists", status: "fail" });
  }
  sections.push({ id: "robots", title: "Robots.txt", checks: robotsChecks, score: scoreFromChecks(robotsChecks) });

  // ==== Sitemap.xml ====
  const sitemapChecks: Check[] = [];
  if (sitemapRes.status === "fulfilled" && sitemapRes.value.ok) {
    const txt = await sitemapRes.value.text();
    const urlCount = (txt.match(/<url>/gi) || []).length;
    sitemapChecks.push({ id: "sitemap-exists", label: "sitemap.xml exists", status: "pass" });
    sitemapChecks.push({ id: "sitemap-urls", label: "URLs in sitemap", status: urlCount > 0 ? "pass" : "warn", detail: `${urlCount} URLs` });
  } else {
    sitemapChecks.push({ id: "sitemap-exists", label: "sitemap.xml exists", status: "fail" });
  }
  sections.push({ id: "sitemap", title: "Sitemap.xml", checks: sitemapChecks, score: scoreFromChecks(sitemapChecks) });

  // ==== Structured data ====
  const jsonLdBlocks = all(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi).map(m => m[1]);
  let ldTypes: string[] = [];
  const ldValidations: Array<{ type: string; missing: string[] }> = [];
  const requiredFields: Record<string, string[]> = {
    Article: ["headline", "author", "datePublished"],
    NewsArticle: ["headline", "author", "datePublished"],
    BlogPosting: ["headline", "author", "datePublished"],
    Product: ["name", "image", "offers"],
    Organization: ["name", "url"],
    LocalBusiness: ["name", "address", "telephone"],
    BreadcrumbList: ["itemListElement"],
    FAQPage: ["mainEntity"],
    HowTo: ["name", "step"],
    Event: ["name", "startDate", "location"],
    Recipe: ["name", "recipeIngredient", "recipeInstructions"],
    VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  };
  for (const b of jsonLdBlocks) {
    try {
      const j = JSON.parse(b);
      const items = Array.isArray(j) ? j : [j];
      for (const item of items) {
        const t = item["@type"];
        const types = (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
        ldTypes.push(...types);
        for (const typeName of types) {
          const req = requiredFields[typeName];
          if (!req) continue;
          const missing = req.filter((f) => item[f] == null || (Array.isArray(item[f]) && item[f].length === 0));
          if (missing.length) ldValidations.push({ type: typeName, missing });
        }
      }
    } catch { /* ignore */ }
  }
  const sdChecks: Check[] = [
    { id: "jsonld", label: "JSON-LD structured data", status: jsonLdBlocks.length > 0 ? "pass" : "warn", detail: `${jsonLdBlocks.length} blocks`, value: ldTypes.join(", ") },
    ...ldValidations.map((v, i): Check => ({
      id: `ld-req-${v.type}-${i}`,
      label: `${v.type} required fields`,
      status: "fail",
      detail: `Missing: ${v.missing.join(", ")}`,
    })),
  ];
  sections.push({ id: "structured", title: "Structure Markup", checks: sdChecks, score: scoreFromChecks(sdChecks), data: { types: ldTypes, validations: ldValidations } });

  // ==== Security / SSL / HTTPS ====
  const isHttps = finalUrl.startsWith("https://");
  const hstsHeader = res.headers.get("strict-transport-security");
  const xcto = res.headers.get("x-content-type-options");
  const csp = res.headers.get("content-security-policy");
  const refPolicy = res.headers.get("referrer-policy");
  const sslChecks: Check[] = [
    { id: "https", label: "Serves over HTTPS", status: isHttps ? "pass" : "fail" },
    { id: "hsts", label: "HSTS header", status: hstsHeader ? "pass" : "warn" },
    { id: "xcto", label: "X-Content-Type-Options", status: xcto === "nosniff" ? "pass" : "warn" },
    { id: "csp", label: "Content-Security-Policy", status: csp ? "pass" : "warn" },
    { id: "referrer", label: "Referrer-Policy", status: refPolicy ? "pass" : "warn" },
  ];
  sections.push({ id: "ssl", title: "SSL & Security Headers", checks: sslChecks, score: scoreFromChecks(sslChecks) });

  // ==== Expanded security headers ====
  const xfo = res.headers.get("x-frame-options");
  const permPolicy = res.headers.get("permissions-policy");
  const coop = res.headers.get("cross-origin-opener-policy");
  const secExtra: Check[] = [
    { id: "xfo", label: "X-Frame-Options / frame-ancestors", status: xfo || /frame-ancestors/i.test(csp || "") ? "pass" : "warn", value: xfo || (csp && /frame-ancestors/i.test(csp) ? "via CSP" : "") },
    { id: "perm-policy", label: "Permissions-Policy", status: permPolicy ? "pass" : "warn", value: permPolicy || "" },
    { id: "coop", label: "Cross-Origin-Opener-Policy", status: coop ? "pass" : "info", value: coop || "" },
  ];
  sections.push({ id: "security", title: "Additional Security Headers", checks: secExtra, score: scoreFromChecks(secExtra) });

  // ==== Performance / page weight / DOM ====
  const bytes = new TextEncoder().encode(html).length;
  const domNodes = (html.match(/<[a-zA-Z][^>]*>/g) || []).length;
  const perfChecks: Check[] = [
    { id: "ttfb", label: "Response time", status: duration < 1000 ? "pass" : duration < 3000 ? "warn" : "fail", detail: `${duration} ms` },
    { id: "size", label: "HTML page weight", status: bytes < 200_000 ? "pass" : bytes < 500_000 ? "warn" : "fail", detail: `${(bytes/1024).toFixed(1)} KB` },
    { id: "dom", label: "DOM size", status: domNodes < 1500 ? "pass" : domNodes < 3000 ? "warn" : "fail", detail: `${domNodes} nodes` },
    { id: "cdn", label: "CDN in use (server header)", status: /(cloudflare|fastly|akamai|cloudfront|vercel|netlify)/i.test(res.headers.get("server") || res.headers.get("via") || res.headers.get("x-served-by") || "") ? "pass" : "info", value: res.headers.get("server") || "" },
  ];
  sections.push({ id: "performance", title: "Page Speed & Performance", checks: perfChecks, score: scoreFromChecks(perfChecks) });

  // ==== Favicon ====
  const faviconLink = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i)?.[1];
  const favOk = faviconLink || (faviconRes.status === "fulfilled" && faviconRes.value.ok);
  sections.push({ id: "favicon", title: "Favicon Test", checks: [{ id: "favicon", label: "Favicon present", status: favOk ? "pass" : "warn", value: faviconLink || "" }], score: favOk ? 100 : 50 });

  // ==== 404 test ====
  const notFoundStatus = notFoundRes.status === "fulfilled" ? notFoundRes.value.status : 0;
  sections.push({ id: "notfound", title: "Custom 404 Page Test", checks: [
    { id: "404", label: "Returns 404 for missing pages", status: notFoundStatus === 404 ? "pass" : notFoundStatus === 200 ? "fail" : "warn", detail: `Status: ${notFoundStatus}` }
  ], score: notFoundStatus === 404 ? 100 : notFoundStatus === 200 ? 0 : 50 });

  // ==== Mobile / analytics detection ====
  const hasGA = /gtag\(|google-analytics\.com|googletagmanager\.com/i.test(html);
  const mobileChecks: Check[] = [
    { id: "mobile", label: "Mobile-friendly viewport", status: viewport.includes("width=device-width") ? "pass" : "fail", value: viewport },
    { id: "ga", label: "Google Analytics / Tag Manager", status: hasGA ? "pass" : "info" },
  ];
  sections.push({ id: "mobile", title: "Mobile & Analytics", checks: mobileChecks, score: scoreFromChecks(mobileChecks) });

  // ==== Accessibility basics ====
  const inputTagsA11y = all(html, /<input\b[^>]*>/gi).map((m) => m[0]);
  const inputsLabelable = inputTagsA11y.filter((t) => /\baria-label\s*=/i.test(t) || /\baria-labelledby\s*=/i.test(t) || /\bid\s*=/i.test(t)).length;
  const buttonBlocks = all(html, /<button\b([^>]*)>([\s\S]*?)<\/button>/gi);
  const buttonsNamed = buttonBlocks.filter((m) => m[2].replace(/<[^>]+>/g, "").trim().length > 0 || /\baria-label\s*=/i.test(m[1])).length;
  const skipLink = /<a[^>]*href=["']#(?:main|content|skip)/i.test(html);
  const emptyLinks = all(html, /<a\b[^>]*>\s*<\/a>/gi).length;
  const accessibility: Check[] = [
    { id: "lang-a11y", label: "Document language declared", status: lang ? "pass" : "fail", value: lang || "missing" },
    { id: "img-alt-cov", label: "Image alt coverage", status: imgs.length === 0 ? "info" : imgsWithoutAlt === 0 ? "pass" : imgsWithoutAlt < imgs.length / 2 ? "warn" : "fail", detail: `${imgs.length - imgsWithoutAlt}/${imgs.length} have alt text` },
    { id: "input-labels", label: "Form inputs are labelable", status: inputTagsA11y.length === 0 ? "info" : inputsLabelable === inputTagsA11y.length ? "pass" : "warn", detail: `${inputsLabelable}/${inputTagsA11y.length} inputs have id/aria-label` },
    { id: "button-names", label: "Buttons have accessible names", status: buttonBlocks.length === 0 ? "info" : buttonsNamed === buttonBlocks.length ? "pass" : "warn", detail: `${buttonsNamed}/${buttonBlocks.length} buttons have text or aria-label` },
    { id: "skip-link", label: "Skip-to-content link", status: skipLink ? "pass" : "info" },
    { id: "empty-links", label: "No empty <a> elements", status: emptyLinks === 0 ? "pass" : "warn", detail: `${emptyLinks} empty link(s)` },
  ];
  sections.push({ id: "accessibility", title: "Accessibility Basics", checks: accessibility, score: scoreFromChecks(accessibility) });

  // ==== International SEO / hreflang ====
  const hreflangs = all(html, /<link\b[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']/gi).map((m) => ({ hreflang: m[1], href: m[2] }));
  const hasXDefault = hreflangs.some((h) => h.hreflang.toLowerCase() === "x-default");
  const canonicalSelf = canonical ? (() => { try { return new URL(canonical, finalUrl).toString() === finalUrl; } catch { return false; } })() : false;
  const i18nChecks: Check[] = [
    { id: "hreflang", label: "hreflang alternates", status: hreflangs.length > 0 ? "pass" : "info", detail: `${hreflangs.length} alternate(s)` },
    { id: "xdefault", label: "hreflang x-default present", status: hreflangs.length === 0 ? "info" : hasXDefault ? "pass" : "warn" },
    { id: "canonical-self", label: "Canonical points to the same URL", status: !canonical ? "warn" : canonicalSelf ? "pass" : "info", detail: canonical ? (canonicalSelf ? "self-canonical" : `points to ${canonical}`) : "no canonical set" },
  ];
  sections.push({ id: "i18n", title: "International SEO", checks: i18nChecks, score: scoreFromChecks(i18nChecks), data: { hreflangs } });

  // ==== Render-blocking / performance additions ====
  const stylesheets = (html.match(/<link\b[^>]*rel\s*=\s*["']stylesheet["']/gi) ?? []).length;
  const headBlock = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? "";
  const headScripts = (headBlock.match(/<script\b(?![^>]*\b(?:async|defer)\b)[^>]*>/gi) ?? []).length;
  const perfExtras: Check[] = [
    { id: "stylesheets", label: "External stylesheets", status: stylesheets <= 3 ? "pass" : stylesheets <= 6 ? "warn" : "fail", detail: `${stylesheets} <link rel="stylesheet">` },
    { id: "blocking-js", label: "Render-blocking scripts in <head>", status: headScripts === 0 ? "pass" : headScripts <= 2 ? "warn" : "fail", detail: `${headScripts} sync script(s) in <head>` },
  ];
  sections.push({ id: "performance-extra", title: "Render Blocking", checks: perfExtras, score: scoreFromChecks(perfExtras) });

  const overall = Math.round(sections.reduce((a,s)=>a+s.score,0) / sections.length);

  return {
    url: rawUrl,
    final_url: finalUrl,
    fetched_at: new Date().toISOString(),
    overall_score: overall,
    sections,
    meta: { status_code: res.status, duration_ms: duration, bytes, content_type: res.headers.get("content-type") },
  };
}

function fleschReading(text: string): number {
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((n, w) => n + syllableCount(w), 0);
  const asl = words.length / sentences;
  const asw = syllables / Math.max(words.length, 1);
  return +(206.835 - 1.015 * asl - 84.6 * asw).toFixed(1);
}
function syllableCount(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  const m = word.match(/[aeiouy]+/g);
  let n = m ? m.length : 1;
  if (word.endsWith("e")) n = Math.max(1, n - 1);
  return n;
}