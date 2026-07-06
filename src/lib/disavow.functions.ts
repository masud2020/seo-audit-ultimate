import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SPAM_ANCHOR_PATTERNS = [
  /viagra|cialis|pharma|casino|poker|escort|porn|adult|xxx|loan|payday|replica|essay writing|dating|betting|slot|crypto pump/i,
];

interface BacklinkRow {
  source_url: string;
  source_domain: string;
  anchor: string;
  external_num: number;
  internal_num: number;
  domain_ascore: number;
  page_ascore: number;
  nofollow: boolean;
  first_seen: string;
  last_seen: string;
  toxicity_score: number;
  bucket: "toxic" | "suspicious" | "healthy";
  reasons: string[];
}

function scoreBacklink(r: {
  source_url: string; anchor: string; external_num: number; internal_num: number;
  domain_ascore: number; page_ascore: number; nofollow: boolean;
}): { score: number; bucket: "toxic" | "suspicious" | "healthy"; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (r.domain_ascore < 10) { score += 40; reasons.push(`Very low domain authority (${r.domain_ascore})`); }
  else if (r.domain_ascore < 20) { score += 25; reasons.push(`Low domain authority (${r.domain_ascore})`); }
  if (r.external_num > 100) { score += 15; reasons.push(`Link farm (${r.external_num} external links on page)`); }
  else if (r.external_num > 50) { score += 8; reasons.push(`Many external links (${r.external_num})`); }
  if (SPAM_ANCHOR_PATTERNS.some(p => p.test(r.anchor))) { score += 30; reasons.push(`Spammy anchor text`); }
  if (r.page_ascore < 5) { score += 10; reasons.push(`Weak source page`); }
  const bucket: "toxic" | "suspicious" | "healthy" = score >= 45 ? "toxic" : score >= 20 ? "suspicious" : "healthy";
  return { score, bucket, reasons };
}

export const scanBacklinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string; limit?: number }) => z.object({ domain: z.string().min(3).max(255), limit: z.number().int().min(1).max(1000).optional().default(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { semrushCall, cleanDomain } = await import("./semrush.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: s } = await (context.supabase as any).from("api_settings").select("semrush_key").eq("user_id", context.userId).maybeSingle();
    const key = (s as { semrush_key?: string } | null)?.semrush_key;
    if (!key) throw new Error("Semrush API key missing. Add it in Settings → SEO Data Providers.");
    const target = cleanDomain(data.domain);
    const rows = await semrushCall({
      type: "backlinks", target, target_type: "root_domain",
      display_limit: String(data.limit),
      export_columns: "source_url,source_title,anchor,external_num,internal_num,domain_ascore,page_ascore,nofollow,first_seen,last_seen",
    }, key);
    const scored: BacklinkRow[] = rows.map(r => {
      const sourceUrl = r.source_url || "";
      let sourceDomain = "";
      try { sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      const base = {
        source_url: sourceUrl,
        source_domain: sourceDomain,
        anchor: r.anchor || "",
        external_num: Number(r.external_num) || 0,
        internal_num: Number(r.internal_num) || 0,
        domain_ascore: Number(r.domain_ascore) || 0,
        page_ascore: Number(r.page_ascore) || 0,
        nofollow: /true|1/i.test(r.nofollow || ""),
        first_seen: r.first_seen || "",
        last_seen: r.last_seen || "",
      };
      const { score, bucket, reasons } = scoreBacklink(base);
      return { ...base, toxicity_score: score, bucket, reasons };
    });
    const summary = {
      total: scored.length,
      toxic: scored.filter(r => r.bucket === "toxic").length,
      suspicious: scored.filter(r => r.bucket === "suspicious").length,
      healthy: scored.filter(r => r.bucket === "healthy").length,
    };
    return { target, rows: scored.sort((a, b) => b.toxicity_score - a.toxicity_score), summary };
  });

export const listDisavow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_domain: string }) => z.object({ target_domain: z.string().min(3).max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).from("disavow_entries")
      .select("*").eq("target_domain", data.target_domain).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ id: string; source_domain: string; source_url: string | null; scope: string; reason: string | null; toxicity_score: number | null; created_at: string }>;
  });

export const addDisavow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_domain: string; entries: Array<{ source_domain: string; source_url?: string; scope: "domain" | "url"; reason?: string; toxicity_score?: number }> }) =>
    z.object({
      target_domain: z.string().min(3).max(255),
      entries: z.array(z.object({
        source_domain: z.string().min(3).max(255),
        source_url: z.string().max(2048).optional(),
        scope: z.enum(["domain", "url"]),
        reason: z.string().max(500).optional(),
        toxicity_score: z.number().int().optional(),
      })).min(1).max(500),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const rows = data.entries.map(e => ({
      user_id: context.userId,
      target_domain: data.target_domain,
      source_domain: e.source_domain,
      source_url: e.source_url ?? null,
      scope: e.scope,
      reason: e.reason ?? null,
      toxicity_score: e.toxicity_score ?? null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).from("disavow_entries").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

export const removeDisavow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).from("disavow_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportDisavow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_domain: string }) => z.object({ target_domain: z.string().min(3).max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).from("disavow_entries")
      .select("source_domain,source_url,scope,reason").eq("target_domain", data.target_domain);
    if (error) throw new Error(error.message);
    const lines: string[] = [
      `# Disavow file for ${data.target_domain}`,
      `# Generated by SEO Audit Tool on ${new Date().toISOString().slice(0, 10)}`,
      `# ${(rows ?? []).length} entries`,
      "",
    ];
    for (const r of (rows ?? []) as Array<{ source_domain: string; source_url: string | null; scope: string; reason: string | null }>) {
      if (r.reason) lines.push(`# ${r.reason}`);
      if (r.scope === "url" && r.source_url) lines.push(r.source_url);
      else lines.push(`domain:${r.source_domain}`);
    }
    return { text: lines.join("\n"), count: (rows ?? []).length };
  });