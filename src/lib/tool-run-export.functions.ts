import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

function toBase64(bytes: Uint8Array): string {
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRows(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [headers.join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))].join("\n");
}
function safeName(s: string): string { return s.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) || "run"; }

async function loadRun(supabase: Ctx["supabase"], userId: string, id: string) {
  const { data, error } = await supabase.from("tool_runs").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Run not found");
  return data;
}

async function buildCsvForRun(run: Record<string, unknown>, supabase: Ctx["supabase"], userId: string): Promise<{ csv: string; filename: string }> {
  const tool = String(run.tool);
  const result = (run.result ?? {}) as Record<string, unknown>;
  const stamp = new Date(String(run.created_at)).toISOString().slice(0, 10);
  const base = safeName(`${tool}-${stamp}`);

  if (tool === "broken_links" && run.ref_id) {
    const { data: items } = await supabase.from("link_check_items").select("target_url,source_url,status_code,status_bucket,is_external,error").eq("user_id", userId).eq("check_id", run.ref_id).limit(5000);
    return { csv: csvRows(["target_url", "source_url", "status_code", "status_bucket", "is_external", "error"], (items ?? []) as Array<Record<string, unknown>>), filename: `${base}.csv` };
  }
  if (tool === "backlink_monitor") {
    // Export the current monitored list (this run's context)
    const { data: rows } = await supabase.from("monitored_backlinks").select("source_url,target_url,anchor,target_domain,last_status,last_seen_at,lost_at,source").eq("user_id", userId).limit(5000);
    return { csv: csvRows(["source_url", "target_url", "anchor", "target_domain", "last_status", "last_seen_at", "lost_at", "source"], (rows ?? []) as Array<Record<string, unknown>>), filename: `backlinks-${stamp}.csv` };
  }
  if (tool === "ai_citations") {
    const results = (result.results ?? []) as Array<Record<string, unknown>>;
    return { csv: csvRows(["prompt", "model", "cited", "mentions", "snippet"], results), filename: `${base}.csv` };
  }
  if (tool === "ai_detection") {
    const signals = (result.signals ?? []) as Array<Record<string, unknown>>;
    const head = `metric,value\nai_probability,${result.ai_probability ?? ""}\nverdict,${result.verdict ?? ""}\nconfidence,${result.confidence ?? ""}\n\n`;
    return { csv: head + csvRows(["name", "score", "note"], signals), filename: `${base}.csv` };
  }
  if (tool === "ai_potential") {
    const criteria = (result.criteria ?? []) as Array<Record<string, unknown>>;
    const head = `url,${csvEscape(result.url)}\nscore,${result.overall_score ?? ""}\nverdict,${csvEscape(result.verdict)}\n\n`;
    return { csv: head + csvRows(["id", "label", "score", "note"], criteria), filename: `${base}.csv` };
  }
  if (tool === "seo_news") {
    const items = (result.items ?? []) as Array<Record<string, unknown>>;
    return { csv: csvRows(["source", "title", "link", "published_at", "snippet"], items), filename: `${base}.csv` };
  }
  // Fallback
  return { csv: `key,value\n${Object.entries(result).map(([k, v]) => `${csvEscape(k)},${csvEscape(v)}`).join("\n")}`, filename: `${base}.csv` };
}

export const exportToolRunCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const run = await loadRun(supabase, userId, data.id);
    const { csv, filename } = await buildCsvForRun(run, supabase, userId);
    return { csv, filename };
  });

export const exportToolRunPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const run = await loadRun(supabase, userId, data.id);
    // Enrich broken_links runs with items for the PDF (so it's not just a summary)
    if (run.tool === "broken_links" && run.ref_id) {
      const { data: items } = await supabase.from("link_check_items").select("target_url,status_code,status_bucket,is_external").eq("user_id", userId).eq("check_id", run.ref_id).limit(500);
      (run.result as Record<string, unknown>).items = items ?? [];
    }
    const { buildToolRunPdf } = await import("./tool-run-pdf.server");
    let brand = null;
    try {
      const { data } = await supabase.from("brand_settings").select("app_name,logo_url,primary_color,accent_color,support_email,footer_text").eq("user_id", userId).maybeSingle();
      brand = data ?? null;
    } catch { /* ignore */ }
    const bytes = await buildToolRunPdf(run as Parameters<typeof buildToolRunPdf>[0], brand);
    const stamp = new Date(run.created_at).toISOString().slice(0, 10);
    const filename = `${run.tool}-${stamp}.pdf`;
    return { base64: toBase64(bytes), filename };
  });
