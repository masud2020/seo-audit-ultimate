import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export type NewsItem = { source: string; title: string; link: string; published_at: string | null; snippet: string };

type CacheEntry = { at: number; items: NewsItem[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 15 * 60 * 1000;

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function stripTags(s: string) { return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function pick(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function firstTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1] : null;
}
function firstAttr(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}
function cdata(s: string | null): string { if (!s) return ""; const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/); return (m ? m[1] : s).trim(); }

function parseFeed(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const isAtom = /<feed[\s>]/i.test(xml);
  const entries = isAtom ? pick(xml, "entry") : pick(xml, "item");
  for (const raw of entries) {
    const title = cdata(firstTag(raw, "title"));
    let link = "";
    if (isAtom) {
      link = firstAttr(raw, "link", "href") ?? "";
    } else {
      link = cdata(firstTag(raw, "link")) ?? "";
    }
    const dateRaw = cdata(firstTag(raw, "pubDate")) || cdata(firstTag(raw, "published")) || cdata(firstTag(raw, "updated"));
    let iso: string | null = null;
    if (dateRaw) { const d = new Date(dateRaw); if (!isNaN(d.getTime())) iso = d.toISOString(); }
    const desc = cdata(firstTag(raw, "description")) || cdata(firstTag(raw, "summary")) || cdata(firstTag(raw, "content"));
    const snippet = stripTags(desc).slice(0, 260);
    if (title && link) items.push({ source: sourceName, title: stripTags(title), link: link.trim(), published_at: iso, snippet });
  }
  return items;
}

async function fetchOne(url: string, name: string): Promise<NewsItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "LovableSEOBot/1.0", Accept: "application/rss+xml, application/atom+xml, text/xml, */*" } });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseFeed(xml, name);
  } catch { return []; }
  finally { clearTimeout(t); }
}

export const listBlogSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as Ctx;
    const { data } = await supabase.from("blog_sources").select("*").order("name", { ascending: true });
    return (data ?? []) as Array<{ id: string; name: string; url: string; enabled: boolean }>;
  });

export const fetchSeoNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { force?: boolean }) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const startedAt = Date.now();
    const { data: sources } = await supabase.from("blog_sources").select("*").eq("enabled", true);
    const list = (sources ?? []) as Array<{ name: string; url: string }>;
    const cacheKey = list.map(s => s.url).sort().join("|");
    const now = Date.now();
    if (!data?.force) {
      const c = cache.get(cacheKey);
      if (c && (now - c.at) < TTL_MS) return { items: c.items, cached: true, fetched_at: new Date(c.at).toISOString() };
    }
    const all = await Promise.all(list.map(s => fetchOne(s.url, s.name)));
    const items = all.flat().sort((a, b) => {
      const ta = a.published_at ? Date.parse(a.published_at) : 0;
      const tb = b.published_at ? Date.parse(b.published_at) : 0;
      return tb - ta;
    }).slice(0, 200);
    cache.set(cacheKey, { at: now, items });
    await logToolRun({ supabase, userId, tool: "seo_news", status: "success", label: `${items.length} items · ${list.length} feeds`, input: { sources: list.length, force: !!data?.force }, result: { count: items.length, cached: false, items: items.slice(0, 50) }, duration_ms: Date.now() - startedAt });
    return { items, cached: false, fetched_at: new Date(now).toISOString() };
  });

export const toggleBlogSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; enabled: boolean }) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: adminRes } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!adminRes) throw new Error("Admin only");
    const { error } = await supabase.from("blog_sources").update({ enabled: data.enabled }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addBlogSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; url: string }) => z.object({ name: z.string().min(1).max(80), url: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: adminRes } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!adminRes) throw new Error("Admin only");
    const { error } = await supabase.from("blog_sources").insert({ name: data.name, url: data.url });
    if (error) throw new Error(error.message);
    return { ok: true };
  });