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

async function checkStatus(url: string): Promise<{ code: number | null; bucket: string; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    // HEAD first, then GET fallback (some servers reject HEAD)
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
    return { code: null, bucket, error: msg.slice(0, 200) };
  } finally { clearTimeout(t); }
}

const startInput = z.object({ url: z.string().url(), max_links: z.number().int().min(1).max(500).optional().default(150) });

export const runBrokenLinkCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof startInput>) => startInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as SupabaseCtx;
    // Fetch root page
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    let html = "";
    try {
      const r = await fetch(data.url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "LovableSEOBot/1.0" } });
      if (!r.ok) throw new Error(`Root URL ${r.status}`);
      html = await r.text();
    } catch (e) {
      throw new Error(`Could not fetch root URL: ${e instanceof Error ? e.message : String(e)}`);
    } finally { clearTimeout(t); }

    const rootHost = new URL(data.url).host;
    const links = extractLinks(html, data.url).slice(0, data.max_links);

    const { data: run, error } = await supabase.from("link_checks").insert({
      user_id: userId, root_url: data.url, status: "running", links_total: links.length,
    }).select().single();
    if (error) throw new Error(error.message);
    const runId = (run as { id: string }).id;

    // Check in chunks of 8
    const chunkSize = 8;
    let broken = 0;
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < links.length; i += chunkSize) {
      const batch = links.slice(i, i + chunkSize);
      const results = await Promise.all(batch.map(async (u) => ({ u, res: await checkStatus(u) })));
      for (const { u, res } of results) {
        const isExternal = (() => { try { return new URL(u).host !== rootHost; } catch { return true; } })();
        if (res.bucket === "4xx" || res.bucket === "5xx" || res.bucket === "timeout" || res.bucket === "network-error") broken++;
        rows.push({
          check_id: runId, user_id: userId, source_url: data.url, target_url: u,
          status_code: res.code, status_bucket: res.bucket, is_external: isExternal, error: res.error ?? null,
        });
      }
    }
    if (rows.length) await supabase.from("link_check_items").insert(rows);
    await supabase.from("link_checks").update({
      status: "done", pages_scanned: 1, links_broken: broken, finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return { runId, total: links.length, broken };
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