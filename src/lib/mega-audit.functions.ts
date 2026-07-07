import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const startInput = z.object({
  target_url: z.string().min(3).max(2048),
  competitor_url: z.string().max(2048).optional().nullable(),
  target_keyword: z.string().max(200).optional().nullable(),
  max_pages: z.number().int().min(1).max(100).default(25),
});

export const startMegaAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof startInput>) => startInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: row, error } = await supabase.from("mega_audits").insert({
      user_id: userId,
      target_url: data.target_url,
      competitor_url: data.competitor_url || null,
      target_keyword: data.target_keyword || null,
      max_pages: data.max_pages,
      status: "running",
      progress: 0,
      status_message: "Queued",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = row.id as string;
    try {
      // Pull user's Semrush key + verified GSC sites so orchestrator can use them.
      const [semKey, gscR] = await Promise.all([
        supabase.from("api_settings").select("semrush_key,psi_key").eq("user_id", userId).maybeSingle(),
        supabase.from("gsc_verifications").select("site_url,verified").eq("user_id", userId).eq("verified", true),
      ]);
      const settings = semKey.data as { semrush_key?: string; psi_key?: string } | null;
      const semrushKey = settings?.semrush_key || process.env.SEMRUSH_API_KEY || null;
      const psiKey = settings?.psi_key || process.env.PSI_API_KEY || null;
      const verifiedSites = ((gscR.data ?? []) as Array<{ site_url: string }>).map((s) => s.site_url);

      const { runMegaAudit } = await import("./mega-audit.server");
      const result = await runMegaAudit({
        targetUrl: data.target_url,
        competitorUrl: data.competitor_url || null,
        targetKeyword: data.target_keyword || null,
        maxPages: data.max_pages,
        semrushKey,
        psiKey,
        verifiedSites,
        onProgress: async ({ pct, message }) => {
          try { await supabase.from("mega_audits").update({ progress: pct, status_message: message }).eq("id", id); } catch { /* ignore */ }
        },
      });
      await supabase.from("mega_audits").update({
        status: "complete",
        progress: 100,
        status_message: "Complete",
        overall_score: result.mega_score,
        results: result as never,
      }).eq("id", id);
      return { id };
    } catch (err) {
      await supabase.from("mega_audits").update({
        status: "error", error: err instanceof Error ? err.message : String(err),
      }).eq("id", id);
      throw err;
    }
  });

export const listMegaAudits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data, error } = await supabase.from("mega_audits")
      .select("id,target_url,competitor_url,status,progress,status_message,overall_score,max_pages,created_at,error")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMegaAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: row, error } = await supabase.from("mega_audits").select("*")
      .eq("user_id", userId).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Mega audit not found");
    return row;
  });

export const deleteMegaAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { error } = await supabase.from("mega_audits").delete().eq("user_id", userId).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
