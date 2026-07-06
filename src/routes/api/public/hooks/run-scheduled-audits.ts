import { createFileRoute } from "@tanstack/react-router";

// Cron entry: processes scheduled audits whose next_run_at has passed.
// Called by pg_cron every hour. Auth is via Supabase anon apikey header (bypassed
// on /api/public/*) — actual mutations use the service-role admin client.
export const Route = createFileRoute("/api/public/hooks/run-scheduled-audits")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require a shared secret. /api/public/* bypasses Lovable's auth at the
        // edge, so this endpoint must verify the caller in code before doing
        // service-role-privileged work.
        const cronSecret = process.env.CRON_SECRET;
        const apikey = request.headers.get("apikey") ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        const expectedApikey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const okSecret = !!cronSecret && provided === cronSecret;
        const okApikey = !!expectedApikey && apikey === expectedApikey;
        if (!okSecret && !okApikey) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const { data: due, error } = await supabaseAdmin
          .from("scheduled_audits").select("*")
          .eq("enabled", true).lte("next_run_at", now.toISOString()).limit(20);
        if (error) return json({ ok: false, error: error.message }, 500);

        const results: Array<{ id: string; ok: boolean; audit_id?: string; error?: string; score?: number; diff?: number | null }> = [];
        for (const s of due ?? []) {
          try {
            const { runAudit } = await import("@/lib/audit-engine.server");
            const report = await runAudit(s.url);
            let recs: unknown = [];
            try {
              const { generateRecommendations } = await import("@/lib/ai-recommendations.server");
              recs = await generateRecommendations(report);
            } catch (e) { console.error("recs failed", e); }

            const { data: prev } = await supabaseAdmin.from("audits")
              .select("overall_score").eq("user_id", s.user_id).eq("url", s.url)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            const prevScore = prev?.overall_score ?? null;
            const diff = prevScore != null ? report.overall_score - prevScore : null;

            const { data: newAudit } = await supabaseAdmin.from("audits").insert({
              user_id: s.user_id, url: s.url, status: "complete",
              overall_score: report.overall_score,
              sections: report as never, ai_recommendations: recs as never,
              project_id: s.project_id,
            }).select("id").single();

            const next = new Date(now.getTime() + (s.cadence === "monthly" ? 30 : 7) * 86400_000).toISOString();
            await supabaseAdmin.from("scheduled_audits").update({
              last_run_at: now.toISOString(), next_run_at: next, updated_at: now.toISOString(),
            }).eq("id", s.id);

            // Optional email via Resend connector (if configured)
            if (s.email && process.env.LOVABLE_API_KEY && process.env.RESEND_API_KEY) {
              try {
                await fetch("https://connector-gateway.lovable.dev/resend/emails", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
                    "X-Connection-Api-Key": process.env.RESEND_API_KEY,
                  },
                  body: JSON.stringify({
                    from: "SEO Audit <onboarding@resend.dev>",
                    to: [s.email],
                    subject: `SEO Audit for ${s.url}: score ${report.overall_score}${diff != null ? ` (${diff >= 0 ? "+" : ""}${diff})` : ""}`,
                    html: `<h2>SEO Audit Report</h2><p><b>${s.url}</b></p><p>Overall score: <b>${report.overall_score}</b>${diff != null ? ` (previous: ${prevScore}, change: ${diff >= 0 ? "+" : ""}${diff})` : ""}</p><ul>${report.sections.map(sec => `<li>${sec.title}: ${sec.score}</li>`).join("")}</ul>`,
                  }),
                });
              } catch (e) { console.error("Email failed", e); }
            }
            results.push({ id: s.id, ok: true, audit_id: newAudit?.id, score: report.overall_score, diff });
          } catch (e) {
            results.push({ id: s.id, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return json({ ok: true, processed: results.length, results });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}