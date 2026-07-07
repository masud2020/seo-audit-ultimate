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

      // ---------- External SEO signals (Phase 1) ----------
      // Each returns a Section (or null). Failures are isolated so a bad signal
      // never fails the audit — worst case it just doesn't appear in the report.
      try {
        const { psiSection, redirectChainSection, gscSection, semrushSection, aiVisibilitySection } = await import("./audit-signals.server");
        // Look up user's Semrush key + verified GSC sites in parallel with the signal calls.
        const [settingsRow, gscRow] = await Promise.all([
          supabase.from("api_settings").select("semrush_key,psi_key").eq("user_id", userId).maybeSingle(),
          supabase.from("gsc_verifications").select("site_url,verified").eq("user_id", userId).eq("verified", true),
        ]);
        const settings = settingsRow.data as { semrush_key?: string; psi_key?: string } | null;
        const semrushKey = settings?.semrush_key || process.env.SEMRUSH_API_KEY || null;
        const psiKey = settings?.psi_key || process.env.PSI_API_KEY || null;
        const verifiedSites = (gscRow.data ?? []).map((s) => s.site_url as string);

        const [psi, redir, gsc, sr, ai] = await Promise.allSettled([
          psiSection(report.final_url, psiKey),
          redirectChainSection(data.url),
          gscSection({ url: report.final_url, verifiedSites }),
          semrushSection({ url: report.final_url, apiKey: semrushKey }),
          aiVisibilitySection(report.final_url),
        ]);
        for (const r of [psi, redir, gsc, sr, ai]) {
          if (r.status === "fulfilled" && r.value) report.sections.push(r.value);
        }
        // Recompute overall score to include the new sections.
        report.overall_score = Math.round(report.sections.reduce((a, s) => a + s.score, 0) / report.sections.length);
      } catch (e) {
        console.error("External signals failed", e);
      }

      let aiRecommendations: unknown = [];
      try {
        const { generateRecommendations } = await import("./ai-recommendations.server");
        aiRecommendations = await generateRecommendations(report);
      } catch (e) { console.error("AI recs failed", e); }
      await supabase.from("audits").update({
        status: "complete",
        overall_score: report.overall_score,
        sections: report as never,
        ai_recommendations: aiRecommendations as never,
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