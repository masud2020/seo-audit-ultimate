import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseCtx = { supabase: any; userId: string };

function normalizeUrl(base: string, href: string): string | null {
  try { return new URL(href, base).toString().split("#")[0]; } catch { return null; }
}

function extractLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    const abs = normalizeUrl(base, raw);
    if (abs && /^https?:/i.test(abs)) out.add(abs);
  }
  return [...out];
}

const startInput = z.object({
  url: z.string().url(),
  max_links: z.number().int().min(1).max(2000).optional().default(150),
  max_pages: z.number().int().min(1).max(50).optional().default(1),
  max_depth: z.number().int().min(0).max(5).optional().default(0),
  same_host_only: z.boolean().optional().default(true),
  timeout_ms: z.number().int().min(2000).max(30000).optional().default(10000),
  concurrency: z.number().int().min(1).max(20).optional().default(8),
});

async function checkStatusWith(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (r.status === 405 || r.status === 501) {
      r = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    const c = r.status;
    const bucket = c >= 500 ? "5xx" : c >= 400 ? "4xx" : c >= 300 ? "3xx" : "2xx";
    return { code: c, bucket };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bucket = /aborted|timeout/i.test(msg) ? "timeout" : "network-error";
    return { code: null as number | null, bucket, error: msg.slice(0, 200) };
  } finally { clearTimeout(t); }
}

export const runBrokenLinkCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof startInput>) => startInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as SupabaseCtx;
    const rootHost = new URL(data.url).host;

    // BFS crawl of internal pages up to max_pages / max_depth
    const visitedPages = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: data.url, depth: 0 }];
    // Map of target_url -> source_url (first page that linked to it)
    const linkSources = new Map<string, string>();

    while (queue.length && visitedPages.size < data.max_pages) {
      const { url: pageUrl, depth } = queue.shift()!;
      if (visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), data.timeout_ms + 5000);
      let html = "";
      try {
        const r = await fetch(pageUrl, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "LovableSEOBot/1.0" } });
        if (!r.ok) {
          if (visitedPages.size === 1) throw new Error(`Root URL ${r.status}`);
          continue;
        }
        html = await r.text();
      } catch (e) {
        if (visitedPages.size === 1) throw new Error(`Could not fetch root URL: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      } finally { clearTimeout(t); }

      const found = extractLinks(html, pageUrl);
      for (const l of found) {
        if (linkSources.size >= data.max_links) break;
        if (!linkSources.has(l)) {
          const external = (() => { try { return new URL(l).host !== rootHost; } catch { return true; } })();
          if (data.same_host_only === false || external || true) linkSources.set(l, pageUrl);
          // enqueue internal pages for deeper crawl
          if (!external && depth < data.max_depth && visitedPages.size + queue.length < data.max_pages && !visitedPages.has(l)) {
            queue.push({ url: l, depth: depth + 1 });
          }
        }
      }
      if (linkSources.size >= data.max_links) break;
    }

    const links = [...linkSources.keys()].slice(0, data.max_links);

    const { data: run, error } = await supabase.from("link_checks").insert({
      user_id: userId, root_url: data.url, status: "running", links_total: links.length,
    }).select().single();
    if (error) throw new Error(error.message);
    const runId = (run as { id: string }).id;

    // Check in chunks
    const chunkSize = data.concurrency;
    let broken = 0;
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < links.length; i += chunkSize) {
      const batch = links.slice(i, i + chunkSize);
      const results = await Promise.all(batch.map(async (u) => ({ u, res: await checkStatusWith(u, data.timeout_ms) })));
      for (const { u, res } of results) {
        const isExternal = (() => { try { return new URL(u).host !== rootHost; } catch { return true; } })();
        if (res.bucket === "4xx" || res.bucket === "5xx" || res.bucket === "timeout" || res.bucket === "network-error") broken++;
        rows.push({
          check_id: runId, user_id: userId, source_url: linkSources.get(u) ?? data.url, target_url: u,
          status_code: res.code, status_bucket: res.bucket, is_external: isExternal, error: res.error ?? null,
        });
      }
    }
    if (rows.length) await supabase.from("link_check_items").insert(rows);
    await supabase.from("link_checks").update({
      status: "done", pages_scanned: visitedPages.size, links_broken: broken, finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return { runId, total: links.length, broken, pages: visitedPages.size };
  });

export const listBrokenLinkChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as SupabaseCtx;
    const { data, error } = await supabase.from("link_checks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getBrokenLinkItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as SupabaseCtx;
    const { data: items, error } = await supabase.from("link_check_items").select("*").eq("user_id", userId).eq("check_id", data.runId).order("status_bucket", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return items ?? [];
  });