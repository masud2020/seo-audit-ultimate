import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const startAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => z.object({ url: z.string().min(3).max(2048) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("audits").insert({
      user_id: userId, url: data.url, status: "running",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const auditId = row.id as string;
    try {
      const { runAudit } = await import("./audit-engine.server");
      const report = await runAudit(data.url);
      let aiRecommendations: unknown = [];
      try {
        const { generateRecommendations } = await import("./ai-recommendations.server");
        aiRecommendations = await generateRecommendations(report);
      } catch (e) { console.error("AI recs failed", e); }
      await supabase.from("audits").update({
        status: "complete",
        overall_score: report.overall_score,
        sections: report as unknown as Record<string, unknown>,
        ai_recommendations: aiRecommendations as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }).eq("id", auditId);
      return { id: auditId };
    } catch (err) {
      await supabase.from("audits").update({ status: "error", error: err instanceof Error ? err.message : String(err) }).eq("id", auditId);
      throw err;
    }
  });

export const listAudits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audits").select("id,url,status,overall_score,created_at,error")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("audits").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("audits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: recent } = await context.supabase.from("audits")
      .select("id,url,overall_score,status,created_at")
      .order("created_at", { ascending: false }).limit(5);
    const { count } = await context.supabase.from("audits").select("id", { count: "exact", head: true });
    const { data: scored } = await context.supabase.from("audits").select("overall_score").not("overall_score", "is", null);
    const avg = scored && scored.length ? Math.round(scored.reduce((a, r) => a + (r.overall_score ?? 0), 0) / scored.length) : null;
    return { recent: recent ?? [], total: count ?? 0, avg_score: avg };
  });