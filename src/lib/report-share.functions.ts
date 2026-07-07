import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const REPORT_TYPES = ["audit", "site_audit", "tool_run"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function makeToken(): string {
  // URL-safe base64 of 24 random bytes → 32 chars
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const createInput = z.object({
  report_id: z.string().uuid(),
  report_type: z.enum(REPORT_TYPES),
  expires_in_days: z.number().int().min(1).max(365).default(30),
});

export const createReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createInput.parse(v))
  .handler(async ({ data, context }): Promise<{ token: string; expires_at: string }> => {
    // Verify the caller actually owns the referenced report before minting a token.
    const table = data.report_type === "audit" ? "audits" : data.report_type === "site_audit" ? "site_audits" : "tool_runs";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data: row, error } = await supabase
      .from(table)
      .select("id,user_id")
      .eq("id", data.report_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Response("Report not found", { status: 404 });

    const token = makeToken();
    const expiresAt = new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString();
    const { error: insErr } = await supabase.from("report_shares").insert({
      user_id: context.userId,
      token,
      report_id: data.report_id,
      report_type: data.report_type,
      expires_at: expiresAt,
    });
    if (insErr) throw new Error(insErr.message);
    return { token, expires_at: expiresAt };
  });

export const listReportShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; token: string; report_id: string; report_type: ReportType; expires_at: string; created_at: string }>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("report_shares")
      .select("id,token,report_id,report_type,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; token: string; report_id: string; report_type: ReportType; expires_at: string; created_at: string }>;
  });

export const revokeReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { error } = await supabase.from("report_shares").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: resolve a share token to a report row. No auth required. */
// Loosely typed record to keep the RPC serializer happy — the caller
// treats the payload as a JSON blob and narrows via the normalizer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PublicReportRow = Record<string, any>;

export const resolveReportShare = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ token: z.string().min(10).max(128) }).parse(v))
  .handler(async ({ data }): Promise<{ report: PublicReportRow; report_type: ReportType; expires_at: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error } = await supabaseAdmin
      .from("report_shares")
      .select("report_id,report_type,expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!share) throw new Response("Share link not found", { status: 404 });
    const expiresAt = new Date(String(share.expires_at));
    if (expiresAt.getTime() < Date.now()) throw new Response("Share link expired", { status: 410 });

    const table = share.report_type === "audit" ? "audits" : share.report_type === "site_audit" ? "site_audits" : "tool_runs";
    const { data: row, error: rowErr } = await supabaseAdmin.from(table).select("*").eq("id", share.report_id).maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Response("Report no longer available", { status: 404 });

    // Strip any owner-identifying fields before returning to the public.
    const safe: PublicReportRow = { ...(row as PublicReportRow) };
    delete safe.user_id;
    delete safe.owner_id;
    return { report: safe, report_type: share.report_type as ReportType, expires_at: String(share.expires_at) };
  });