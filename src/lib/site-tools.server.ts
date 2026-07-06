// Server-only helpers for site inspection tools.

export function normalizeUrl(u: string): string {
  let s = u.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  headers: Record<string, string>;
  bytes: number;
  ttfb_ms: number;
  total_ms: number;
  content_type: string;
}

export async function fetchPage(rawUrl: string, timeoutMs = 15000): Promise<FetchResult> {
  const url = normalizeUrl(rawUrl);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const start = Date.now();
  let ttfb = 0;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableSEOBot/1.0)" },
    });
    ttfb = Date.now() - start;
    const buf = await res.arrayBuffer();
    const total = Date.now() - start;
    const bytes = buf.byteLength;
    const ct = res.headers.get("content-type") ?? "";
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return {
      url, finalUrl: res.url || url, status: res.status, ok: res.ok,
      html, headers, bytes, ttfb_ms: ttfb, total_ms: total, content_type: ct,
    };
  } finally {
    clearTimeout(t);
  }
}

export function extractLinks(html: string, baseUrl: string): { href: string; anchor: string; rel: string; nofollow: boolean }[] {
  const out: { href: string; anchor: string; rel: string; nofollow: boolean }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
    const hrefM = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!hrefM) continue;
    let href = hrefM[1];
    try { href = new URL(href, baseUrl).toString(); } catch { continue; }
    const relM = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const rel = relM ? relM[1] : "";
    out.push({ href, anchor: inner, rel, nofollow: /nofollow/i.test(rel) });
  }
  return out;
}

export function countResources(html: string): { scripts: number; styles: number; images: number; iframes: number } {
  const c = (re: RegExp) => (html.match(re) ?? []).length;
  return {
    scripts: c(/<script\b/gi),
    styles: c(/<link\b[^>]*rel\s*=\s*["']stylesheet["']/gi) + c(/<style\b/gi),
    images: c(/<img\b/gi),
    iframes: c(/<iframe\b/gi),
  };
}

export function extractHeadTag(html: string, tag: string, attr?: string): string[] {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!attr) { out.push(m[0]); continue; }
    const am = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i").exec(m[1]);
    if (am) out.push(am[1]);
  }
  return out;
}

export function stripScriptsStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}