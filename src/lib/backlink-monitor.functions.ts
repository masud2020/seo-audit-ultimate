import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

function cleanDomain(d: string) {
  return d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

export const listMonitoredBacklinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data, error } = await supabase.from("monitored_backlinks").select("*").eq("user_id", userId).order("last_seen_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addBacklink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { source_url: string; target_url: string; anchor?: string }) =>
    z.object({ source_url: z.string().url(), target_url: z.string().url(), anchor: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const targetDomain = cleanDomain(new URL(data.target_url).host);
    const { error } = await supabase.from("monitored_backlinks").upsert({
      user_id: userId, source_url: data.source_url, target_url: data.target_url,
      anchor: data.anchor ?? null, target_domain: targetDomain, source: "manual",
      last_status: "live", last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,source_url,target_url" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBacklink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { error } = await supabase.from("monitored_backlinks").delete().eq("user_id", userId).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function checkLive(sourceUrl: string, targetDomain: string): Promise<{ live: boolean; error?: string }> {
  try {
    const { assertPublicHttpUrl } = await import("./net-guard.server");
    assertPublicHttpUrl(sourceUrl);
  } catch (e) {
    return { live: false, error: (e as Error).message };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(sourceUrl, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "LovableSEOBot/1.0" } });
    if (!r.ok) return { live: false, error: `HTTP ${r.status}` };
    const html = await r.text();
    const re = new RegExp(`href\\s*=\\s*["'][^"']*${targetDomain.replace(/\./g, "\\.")}[^"']*["']`, "i");
    return { live: re.test(html) };
  } catch (e) {
    return { live: false, error: e instanceof Error ? e.message : String(e) };
  } finally { clearTimeout(t); }
}

export const recheckBacklinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const startedAt = Date.now();
    const { data: rows } = await supabase.from("monitored_backlinks").select("*").eq("user_id", userId).limit(200);
    const list = (rows ?? []) as Array<{ id: string; source_url: string; target_domain: string; last_status: string }>;
    let live = 0, lost = 0;
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6);
      const results = await Promise.all(batch.map((row) => checkLive(row.source_url, row.target_domain).then((res) => ({ row, res }))));
      for (const { row, res } of results) {
        if (res.live) {
          live++;
          await supabase.from("monitored_backlinks").update({ last_status: "live", last_seen_at: new Date().toISOString(), lost_at: null }).eq("id", row.id);
        } else {
          lost++;
          const patch: Record<string, unknown> = { last_status: "lost" };
          if (row.last_status !== "lost") patch.lost_at = new Date().toISOString();
          await supabase.from("monitored_backlinks").update(patch).eq("id", row.id);
        }
      }
    }
    const res = { checked: list.length, live, lost };
    await logToolRun({ supabase, userId, tool: "backlink_monitor", status: "success", label: `Recheck · ${list.length} links`, input: { action: "recheck" }, result: res, duration_ms: Date.now() - startedAt });
    return res;
  });

export const importFromSemrush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string; limit?: number }) => z.object({ domain: z.string().min(3), limit: z.number().int().min(1).max(200).optional().default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const startedAt = Date.now();
    try {
    const { data: s } = await supabase.from("api_settings").select("semrush_key").eq("user_id", userId).maybeSingle();
    const key = (s as { semrush_key?: string } | null)?.semrush_key;
    if (!key) throw new Error("Semrush API key missing. Add it in Settings.");
    const { semrushCall } = await import("./semrush.server");
    const target = cleanDomain(data.domain);
    const rows = await semrushCall({
      type: "backlinks", target, target_type: "root_domain",
      display_limit: String(data.limit),
      export_columns: "source_url,target_url,anchor,source_size,external_num,internal_num,response_code",
    }, key);
    let inserted = 0;
    for (const r of rows) {
      const source_url = r.source_url; const target_url = r.target_url;
      if (!source_url || !target_url) continue;
      const { error } = await supabase.from("monitored_backlinks").upsert({
        user_id: userId, source_url, target_url, anchor: r.anchor || null,
        target_domain: target, source: "semrush", last_status: "live", last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id,source_url,target_url", ignoreDuplicates: false });
      if (!error) inserted++;
    }
    const res = { imported: inserted, total: rows.length };
    await logToolRun({ supabase, userId, tool: "backlink_monitor", status: "success", label: `Semrush import · ${target}`, input: { action: "semrush_import", domain: target, limit: data.limit }, result: res, duration_ms: Date.now() - startedAt });
    return res;
    } catch (e) {
      await logToolRun({ supabase, userId, tool: "backlink_monitor", status: "error", label: `Semrush import · ${data.domain}`, input: { action: "semrush_import", domain: data.domain }, error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startedAt });
      throw e;
    }
  });