import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

type Ctx = { supabase: unknown; userId: string };

// ============================================================
// 1) Backlink Checker — checks candidate source URLs for links to target
// ============================================================
const backlinkSchema = z.object({
  target: z.string().min(3).max(500),
  sources: z.string().min(3).max(20000), // newline separated URLs
});

export type BacklinkRow = {
  source: string;
  status: number;
  found: boolean;
  links: { href: string; anchor: string; rel: string; nofollow: boolean }[];
  error?: string;
};

export const runBacklinkChecker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof backlinkSchema>) => backlinkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { fetchPage, extractLinks, normalizeUrl } = await import("./site-tools.server");
    const started = Date.now();
    const targetUrl = normalizeUrl(data.target);
    const targetHost = new URL(targetUrl).host.replace(/^www\./, "");
    const sourceUrls = data.sources.split(/\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 25);
    const rows: BacklinkRow[] = [];
    for (const src of sourceUrls) {
      try {
        const r = await fetchPage(src, 12000);
        const all = extractLinks(r.html, r.finalUrl);
        const matches = all.filter((l) => {
          try { return new URL(l.href).host.replace(/^www\./, "") === targetHost; } catch { return false; }
        });
        rows.push({ source: r.finalUrl, status: r.status, found: matches.length > 0, links: matches.slice(0, 20) });
      } catch (e) {
        rows.push({ source: src, status: 0, found: false, links: [], error: e instanceof Error ? e.message : String(e) });
      }
    }
    const foundCount = rows.filter((r) => r.found).length;
    const run_id = await logToolRun({
      supabase, userId, tool: "backlink_checker", status: "success",
      label: `${targetHost} · ${foundCount}/${rows.length} linking`,
      input: data as unknown as Record<string, unknown>,
      result: { target: targetUrl, rows } as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { target: targetUrl, rows, run_id };
  });

// ============================================================
// 2) Website Speed — fetch & measure basic perf metrics
// ============================================================
const urlSchema = z.object({ url: z.string().min(3).max(500) });

export type SpeedResult = {
  url: string;
  status: number;
  ttfb_ms: number;
  total_ms: number;
  bytes: number;
  kb: number;
  content_type: string;
  resources: { scripts: number; styles: number; images: number; iframes: number };
  server: string;
  cache_control: string;
  gzip: boolean;
  cdn: string | null;
  score: number;
  suggestions: string[];
  run_id?: string | null;
};

export const runWebsiteSpeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof urlSchema>) => urlSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { fetchPage, countResources } = await import("./site-tools.server");
    const started = Date.now();
    const r = await fetchPage(data.url, 20000);
    const resources = countResources(r.html);
    const gzip = /gzip|br|deflate/.test(r.headers["content-encoding"] ?? "");
    const cdnHeader = r.headers["cf-ray"] ? "Cloudflare"
      : r.headers["x-vercel-id"] ? "Vercel"
      : r.headers["x-amz-cf-id"] ? "CloudFront"
      : r.headers["x-served-by"] ? "Fastly"
      : null;
    const suggestions: string[] = [];
    if (r.ttfb_ms > 800) suggestions.push(`Slow TTFB (${r.ttfb_ms}ms) — improve server response time.`);
    if (r.bytes > 1_500_000) suggestions.push(`Large page (${(r.bytes / 1024).toFixed(0)} KB) — compress assets.`);
    if (!gzip) suggestions.push("Enable gzip or brotli compression.");
    if (resources.scripts > 20) suggestions.push(`Too many scripts (${resources.scripts}) — bundle or defer.`);
    if (resources.images > 30) suggestions.push(`Many images (${resources.images}) — lazy-load & use webp/avif.`);
    if (!r.headers["cache-control"]) suggestions.push("Missing Cache-Control header.");
    let score = 100;
    if (r.ttfb_ms > 500) score -= Math.min(30, Math.floor((r.ttfb_ms - 500) / 50));
    if (r.bytes > 500_000) score -= Math.min(25, Math.floor((r.bytes - 500_000) / 100_000));
    if (!gzip) score -= 10;
    if (resources.scripts > 15) score -= Math.min(15, resources.scripts - 15);
    score = Math.max(0, Math.min(100, score));
    const result: SpeedResult = {
      url: r.finalUrl, status: r.status, ttfb_ms: r.ttfb_ms, total_ms: r.total_ms,
      bytes: r.bytes, kb: Math.round(r.bytes / 1024), content_type: r.content_type,
      resources, server: r.headers["server"] ?? "unknown",
      cache_control: r.headers["cache-control"] ?? "",
      gzip, cdn: cdnHeader, score, suggestions,
    };
    const run_id = await logToolRun({
      supabase, userId, tool: "website_speed", status: "success",
      label: `${new URL(r.finalUrl).host} · ${score}/100 · ${r.total_ms}ms`,
      input: data as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { ...result, run_id };
  });

// ============================================================
// 3) Responsive Check — meta viewport, media queries, responsive markers
// ============================================================
export type ResponsiveResult = {
  url: string;
  viewport_meta: string | null;
  has_viewport: boolean;
  responsive_viewport: boolean;
  media_queries: number;
  picture_tags: number;
  srcset_imgs: number;
  total_imgs: number;
  flexible_units_pct: number;
  fixed_width_elements: number;
  score: number;
  issues: string[];
  run_id?: string | null;
};

export const runResponsiveCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof urlSchema>) => urlSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { fetchPage, extractHeadTag } = await import("./site-tools.server");
    const started = Date.now();
    const r = await fetchPage(data.url, 15000);
    const viewports = extractHeadTag(r.html, "meta", "content").filter((c) => /width\s*=/i.test(c));
    const viewport_meta = viewports[0] ?? null;
    const responsive_viewport = !!viewport_meta && /width\s*=\s*device-width/i.test(viewport_meta);
    const media_queries = (r.html.match(/@media\b/gi) ?? []).length;
    const picture_tags = (r.html.match(/<picture\b/gi) ?? []).length;
    const total_imgs = (r.html.match(/<img\b/gi) ?? []).length;
    const srcset_imgs = (r.html.match(/\bsrcset\s*=/gi) ?? []).length;
    const fixedWidthMatches = r.html.match(/\bwidth\s*=\s*["']?\d{3,}["']?/gi) ?? [];
    const fixed_width_elements = fixedWidthMatches.length;
    const flexMatches = (r.html.match(/\b\d+(?:\.\d+)?(?:%|vw|rem|em)\b/g) ?? []).length;
    const pxMatches = (r.html.match(/\b\d+px\b/g) ?? []).length;
    const flexible_units_pct = flexMatches + pxMatches === 0 ? 0 : Math.round((flexMatches / (flexMatches + pxMatches)) * 100);
    const issues: string[] = [];
    if (!viewport_meta) issues.push("Missing <meta name=\"viewport\"> tag.");
    else if (!responsive_viewport) issues.push("Viewport meta present but not set to device-width.");
    if (media_queries === 0) issues.push("No CSS media queries detected.");
    if (total_imgs > 0 && srcset_imgs === 0 && picture_tags === 0) issues.push("No responsive images (srcset/picture) found.");
    if (fixed_width_elements > 5) issues.push(`${fixed_width_elements} elements with fixed pixel widths.`);
    let score = 100;
    if (!responsive_viewport) score -= 40;
    if (media_queries === 0) score -= 20;
    if (total_imgs > 0 && srcset_imgs === 0 && picture_tags === 0) score -= 15;
    if (fixed_width_elements > 5) score -= 10;
    if (flexible_units_pct < 40) score -= 10;
    score = Math.max(0, Math.min(100, score));
    const result: ResponsiveResult = {
      url: r.finalUrl, viewport_meta, has_viewport: !!viewport_meta, responsive_viewport,
      media_queries, picture_tags, srcset_imgs, total_imgs,
      flexible_units_pct, fixed_width_elements, score, issues,
    };
    const run_id = await logToolRun({
      supabase, userId, tool: "responsive_check", status: "success",
      label: `${new URL(r.finalUrl).host} · ${score}/100`,
      input: data as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { ...result, run_id };
  });

// ============================================================
// 4) HTML Validator — structural checks
// ============================================================
export type HtmlIssue = { severity: "error" | "warning" | "info"; rule: string; message: string; count?: number };
export type HtmlResult = {
  url: string;
  doctype: string | null;
  lang: string | null;
  title: string | null;
  meta_description: string | null;
  charset: string | null;
  issues: HtmlIssue[];
  totals: { errors: number; warnings: number };
  score: number;
  run_id?: string | null;
};

export const runHtmlValidator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof urlSchema>) => urlSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { fetchPage } = await import("./site-tools.server");
    const started = Date.now();
    const r = await fetchPage(data.url, 15000);
    const html = r.html;
    const issues: HtmlIssue[] = [];
    const doctype = /<!DOCTYPE\s+([^>]+)>/i.exec(html)?.[1] ?? null;
    if (!doctype) issues.push({ severity: "error", rule: "doctype", message: "Missing <!DOCTYPE html> declaration." });
    const htmlTag = /<html\b([^>]*)>/i.exec(html);
    const lang = htmlTag ? /\blang\s*=\s*["']([^"']+)["']/i.exec(htmlTag[1])?.[1] ?? null : null;
    if (!lang) issues.push({ severity: "warning", rule: "lang", message: "Missing lang attribute on <html>." });
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    if (!title) issues.push({ severity: "error", rule: "title", message: "Missing <title> element." });
    else if (title.length > 70) issues.push({ severity: "warning", rule: "title-length", message: `Title is ${title.length} chars (recommended ≤ 60).` });
    const descMatch = /<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html)
      ?? /<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i.exec(html);
    const meta_description = descMatch?.[1] ?? null;
    if (!meta_description) issues.push({ severity: "warning", rule: "meta-description", message: "Missing meta description." });
    const charsetMatch = /<meta\b[^>]*charset\s*=\s*["']?([\w-]+)["']?/i.exec(html);
    const charset = charsetMatch?.[1] ?? null;
    if (!charset) issues.push({ severity: "warning", rule: "charset", message: "Missing <meta charset>." });
    // Images without alt
    const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
    const noAlt = imgTags.filter((t) => !/\balt\s*=/i.test(t)).length;
    if (noAlt > 0) issues.push({ severity: "error", rule: "img-alt", message: `${noAlt} <img> tag(s) missing alt attribute.`, count: noAlt });
    // Duplicate IDs
    const ids = Array.from(html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const dups = [...seen.entries()].filter(([, n]) => n > 1);
    if (dups.length) issues.push({ severity: "error", rule: "duplicate-id", message: `${dups.length} duplicate id value(s): ${dups.slice(0, 5).map(([k]) => k).join(", ")}`, count: dups.length });
    // Multiple H1
    const h1s = (html.match(/<h1\b/gi) ?? []).length;
    if (h1s === 0) issues.push({ severity: "warning", rule: "h1", message: "No <h1> heading found." });
    else if (h1s > 1) issues.push({ severity: "warning", rule: "h1-multiple", message: `Multiple <h1> tags (${h1s}).`, count: h1s });
    // Labels for inputs
    const inputsMissingLabel = (html.match(/<input\b(?![^>]*\b(aria-label|aria-labelledby|type\s*=\s*["'](hidden|submit|button|reset)["'])\b)[^>]*>/gi) ?? [])
      .filter((t) => !/\bid\s*=/i.test(t)).length;
    if (inputsMissingLabel > 0) issues.push({ severity: "warning", rule: "input-label", message: `${inputsMissingLabel} <input>(s) without id/aria-label.`, count: inputsMissingLabel });
    // Deprecated tags
    const deprecated = ["center", "font", "marquee", "blink"].filter((t) => new RegExp(`<${t}\\b`, "i").test(html));
    if (deprecated.length) issues.push({ severity: "warning", rule: "deprecated", message: `Deprecated tag(s): ${deprecated.join(", ")}.` });
    // Inline styles
    const inlineStyles = (html.match(/\bstyle\s*=/gi) ?? []).length;
    if (inlineStyles > 20) issues.push({ severity: "info", rule: "inline-style", message: `${inlineStyles} inline style attributes.`, count: inlineStyles });

    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    const score = Math.max(0, 100 - errors * 12 - warnings * 4);
    const result: HtmlResult = { url: r.finalUrl, doctype, lang, title, meta_description, charset, issues, totals: { errors, warnings }, score };
    const run_id = await logToolRun({
      supabase, userId, tool: "html_validator", status: "success",
      label: `${new URL(r.finalUrl).host} · ${errors}E / ${warnings}W`,
      input: data as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { ...result, run_id };
  });

// ============================================================
// 5) Schema Validator — JSON-LD / microdata / RDFa / OpenGraph / Twitter
// ============================================================
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type SchemaBlock = {
  format: "json-ld" | "microdata" | "rdfa" | "opengraph" | "twitter";
  type: string;
  valid: boolean;
  error?: string;
  raw?: JsonValue;
};
export type SchemaResult = {
  url: string;
  blocks: SchemaBlock[];
  by_format: Record<string, number>;
  by_type: Record<string, number>;
  errors: number;
  score: number;
  suggestions: string[];
  run_id?: string | null;
};

export const runSchemaValidator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof urlSchema>) => urlSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { fetchPage } = await import("./site-tools.server");
    const started = Date.now();
    const r = await fetchPage(data.url, 15000);
    const html = r.html;
    const blocks: SchemaBlock[] = [];

    // JSON-LD
    const jsonLdRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = jsonLdRe.exec(html)) !== null) {
      const raw = m[1].trim();
      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          const type = Array.isArray(it["@type"]) ? it["@type"].join(",") : (it["@type"] ?? "Unknown");
          blocks.push({ format: "json-ld", type: String(type), valid: true, raw: it as JsonValue });
        }
      } catch (e) {
        blocks.push({ format: "json-ld", type: "InvalidJSON", valid: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Microdata
    const microRe = /\bitemtype\s*=\s*["']([^"']+)["']/gi;
    while ((m = microRe.exec(html)) !== null) {
      const type = m[1].split("/").pop() || m[1];
      blocks.push({ format: "microdata", type, valid: true });
    }

    // RDFa
    const rdfaRe = /\btypeof\s*=\s*["']([^"']+)["']/gi;
    while ((m = rdfaRe.exec(html)) !== null) {
      blocks.push({ format: "rdfa", type: m[1], valid: true });
    }

    // OpenGraph
    const ogRe = /<meta\b[^>]*property\s*=\s*["']og:([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["']/gi;
    const ogFound = new Set<string>();
    while ((m = ogRe.exec(html)) !== null) ogFound.add(m[1]);
    if (ogFound.size > 0) blocks.push({ format: "opengraph", type: `${ogFound.size} properties`, valid: true, raw: [...ogFound] });

    // Twitter Card
    const twRe = /<meta\b[^>]*name\s*=\s*["']twitter:([^"']+)["']/gi;
    const twFound = new Set<string>();
    while ((m = twRe.exec(html)) !== null) twFound.add(m[1]);
    if (twFound.size > 0) blocks.push({ format: "twitter", type: `${twFound.size} properties`, valid: true, raw: [...twFound] });

    const by_format: Record<string, number> = {};
    const by_type: Record<string, number> = {};
    for (const b of blocks) {
      by_format[b.format] = (by_format[b.format] ?? 0) + 1;
      by_type[b.type] = (by_type[b.type] ?? 0) + 1;
    }
    const errors = blocks.filter((b) => !b.valid).length;
    const suggestions: string[] = [];
    if (blocks.length === 0) suggestions.push("No structured data detected. Add JSON-LD schema for your primary content type.");
    if (!ogFound.has("title") || !ogFound.has("image")) suggestions.push("Add complete OpenGraph tags (og:title, og:description, og:image, og:url).");
    if (twFound.size === 0) suggestions.push("Add Twitter Card meta tags (twitter:card, twitter:title, twitter:image).");
    if (!by_type["Organization"] && !by_type["WebSite"]) suggestions.push("Consider adding Organization or WebSite JSON-LD for brand identity.");
    if (errors > 0) suggestions.push(`${errors} invalid JSON-LD block(s) — check syntax.`);

    let score = 100;
    if (blocks.length === 0) score = 20;
    else {
      if (errors) score -= errors * 15;
      if (!ogFound.size) score -= 15;
      if (!twFound.size) score -= 10;
      if (!by_format["json-ld"]) score -= 20;
    }
    score = Math.max(0, Math.min(100, score));

    const result: SchemaResult = { url: r.finalUrl, blocks, by_format, by_type, errors, score, suggestions };
    await logToolRun({
      supabase, userId, tool: "schema_validator", status: "success",
      label: `${new URL(r.finalUrl).host} · ${blocks.length} block(s)`,
      input: data as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return result;
  });