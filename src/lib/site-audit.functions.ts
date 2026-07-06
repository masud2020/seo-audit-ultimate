import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const startInput = z.object({
  start_url: z.string().min(3).max(2048),
  max_pages: z.number().int().min(1).max(100).default(25),
});

export const startSiteAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof startInput>) => startInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: row, error } = await supabase.from("site_audits").insert({
      user_id: userId,
      start_url: data.start_url,
      max_pages: data.max_pages,
      status: "running",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = row.id as string;
    try {
      const { runSiteAudit } = await import("./site-audit.server");
      const result = await runSiteAudit(data.start_url, data.max_pages, async (n) => {
        // Best-effort progress; ignore write errors.
        try { await supabase.from("site_audits").update({ pages_audited: n }).eq("id", id); } catch { /* ignore */ }
      });
      await supabase.from("site_audits").update({
        status: "complete",
        pages_audited: result.pages.length,
        overall_score: result.summary.overall_score,
        summary: result.summary as never,
        pages: result.pages as never,
        issues: result.issues as never,
      }).eq("id", id);
      return { id };
    } catch (err) {
      await supabase.from("site_audits").update({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }).eq("id", id);
      throw err;
    }
  });

export const listSiteAudits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data, error } = await supabase.from("site_audits")
      .select("id,start_url,status,overall_score,pages_audited,max_pages,created_at,error")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSiteAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: row, error } = await supabase.from("site_audits").select("*")
      .eq("user_id", userId).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Site audit not found");
    return row;
  });

export const deleteSiteAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { error } = await supabase.from("site_audits").delete().eq("user_id", userId).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });