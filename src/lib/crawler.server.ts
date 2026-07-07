// Whole-site crawler. BFS from start URL, same-origin, up to max_pages.

const UA = "SEOAuditToolBot/1.0 (+https://lovable.app)";

import { assertPublicHttpUrl } from "./net-guard.server";

async function safeFetch(url: string, method: "GET" | "HEAD" = "GET") {
  assertPublicHttpUrl(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    return await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  } finally { clearTimeout(t); }
}

export interface CrawlPage {
  url: string;
  status: number;
  title: string;
  description: string;
  h1_count: number;
  word_count: number;
  bytes: number;
  duration_ms: number;
  canonical: string;
  noindex: boolean;
  images_missing_alt: number;
  internal_links: number;
  external_links: number;
  depth: number;
  inbound_links: number;
}
export interface CrawlIssue { url: string; severity: "high" | "medium" | "low"; message: string; }

export async function runCrawl(startUrl: string, maxPages: number): Promise<{ pages: CrawlPage[]; issues: CrawlIssue[] }> {
  const start = new URL(startUrl.startsWith("http") ? startUrl : `https://${startUrl}`);
  const origin = start.origin;
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: start.toString(), depth: 0 }];
  const pages: CrawlPage[] = [];
  const issues: CrawlIssue[] = [];
  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  const inboundCount = new Map<string, number>();

  while (queue.length && pages.length < maxPages) {
    const item = queue.shift()!;
    const url = item.url;
    const depth = item.depth;
    if (visited.has(url)) continue;
    visited.add(url);

    const t0 = Date.now();
    let res: Response;
    try { res = await safeFetch(url); } catch (e) {
      issues.push({ url, severity: "high", message: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    const duration = Date.now() - t0;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) continue;
    const html = await res.text();
    const bytes = new TextEncoder().encode(html).length;

    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1] || "";
    const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
    const noindex = /noindex/i.test(robotsMeta);
    const h1_count = (html.match(/<h1\b/gi) || []).length;
    const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const word_count = bodyText ? bodyText.split(/\s+/).length : 0;
    const imgs = html.match(/<img[^>]*>/gi) || [];
    const images_missing_alt = imgs.filter(t => !/\balt\s*=\s*["'][^"']+["']/i.test(t)).length;

    let internal_links = 0, external_links = 0;
    const hrefs = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)).map(m => m[1]);
    for (const h of hrefs) {
      if (!h || h.startsWith("javascript:") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("#")) continue;
      try {
        const abs = new URL(h, url);
        if (abs.origin === origin) {
          internal_links++;
          abs.hash = "";
          const clean = abs.toString();
          inboundCount.set(clean, (inboundCount.get(clean) ?? 0) + 1);
          if (!visited.has(clean) && pages.length + queue.length < maxPages * 3) queue.push({ url: clean, depth: depth + 1 });
        } else external_links++;
      } catch { /* skip */ }
    }

    pages.push({ url, status: res.status, title, description, h1_count, word_count, bytes, duration_ms: duration, canonical, noindex, images_missing_alt, internal_links, external_links, depth, inbound_links: 0 });

    // Per-page issues
    if (res.status >= 400) issues.push({ url, severity: "high", message: `HTTP ${res.status}` });
    if (!title) issues.push({ url, severity: "high", message: "Missing title tag" });
    else if (title.length > 60) issues.push({ url, severity: "low", message: `Title too long (${title.length} chars)` });
    if (!description) issues.push({ url, severity: "medium", message: "Missing meta description" });
    else if (description.length > 160) issues.push({ url, severity: "low", message: `Description too long (${description.length} chars)` });
    if (h1_count === 0) issues.push({ url, severity: "medium", message: "Missing H1" });
    else if (h1_count > 1) issues.push({ url, severity: "low", message: `Multiple H1s (${h1_count})` });
    if (noindex) issues.push({ url, severity: "medium", message: "Page has noindex directive" });
    if (word_count < 100 && res.status < 400) issues.push({ url, severity: "low", message: `Thin content (${word_count} words)` });
    if (images_missing_alt > 0) issues.push({ url, severity: "low", message: `${images_missing_alt} image(s) missing alt text` });
    if (bytes > 500_000) issues.push({ url, severity: "low", message: `Large page (${(bytes/1024).toFixed(0)} KB)` });
    if (duration > 3000) issues.push({ url, severity: "medium", message: `Slow response (${duration} ms)` });
    if (depth > 4) issues.push({ url, severity: "low", message: `Deep page (${depth} clicks from root)` });

    if (title) { const arr = titles.get(title) || []; arr.push(url); titles.set(title, arr); }
    if (description) { const arr = descriptions.get(description) || []; arr.push(url); descriptions.set(description, arr); }
  }

  // Backfill inbound-link counts on each page from what we learned during traversal.
  for (const p of pages) p.inbound_links = inboundCount.get(p.url) ?? 0;

  // Duplicate title issues
  for (const [title, urls] of titles) {
    if (urls.length > 1) for (const u of urls) issues.push({ url: u, severity: "medium", message: `Duplicate title (${urls.length} pages): "${title.slice(0, 60)}"` });
  }

  // Duplicate description issues
  for (const [desc, urls] of descriptions) {
    if (urls.length > 1) for (const u of urls) issues.push({ url: u, severity: "low", message: `Duplicate meta description (${urls.length} pages)` });
  }

  // Orphan pages (no inbound internal links from what we crawled). Start URL excluded.
  const startUrlClean = start.toString().replace(/#.*$/, "");
  for (const p of pages) {
    if (p.url !== startUrlClean && (p.inbound_links ?? 0) === 0) {
      issues.push({ url: p.url, severity: "medium", message: "Orphan page — no inbound internal links" });
    }
  }

  // Sitemap vs crawled diff (best-effort)
  try {
    const smRes = await safeFetch(`${origin}/sitemap.xml`);
    if (smRes.ok) {
      const xml = await smRes.text();
      const smUrls = new Set(Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1].trim()));
      const crawled = new Set(pages.map((p) => p.url));
      for (const u of smUrls) if (!crawled.has(u)) issues.push({ url: u, severity: "low", message: "In sitemap but not crawled (may be uncrawlable or beyond max_pages)" });
      let orphanFromCrawl = 0;
      for (const p of pages) if (!smUrls.has(p.url)) orphanFromCrawl++;
      if (orphanFromCrawl && smUrls.size > 0) {
        issues.push({ url: origin, severity: "low", message: `${orphanFromCrawl} crawled URL(s) missing from sitemap.xml` });
      }
    }
  } catch { /* ignore sitemap fetch errors */ }

  return { pages, issues };
}