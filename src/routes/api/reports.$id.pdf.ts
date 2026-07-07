// Printable HTML endpoint for any report. Browsers can Save-as-PDF from this.
// A signed-in user or a valid share token in ?token= grants access.
import { createFileRoute } from "@tanstack/react-router";
import { normalizeAudit, normalizeSiteAudit, normalizeToolRun, summarize, type NormalizedReport } from "@/lib/report-core";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function scoreCls(s: number) {
  if (s >= 80) return "score-good";
  if (s >= 60) return "score-warn";
  return "score-bad";
}

function renderHtml(report: NormalizedReport, recs: Map<string, { summary: string; fixes: Array<{ title: string; impact: string; effort: string; steps: string[] }> }>): string {
  const summary = summarize(report);
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(report.title)} — Report</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #111; background: #fff; margin: 0; padding: 32px; max-width: 960px; margin-inline: auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 12px 0 6px; }
  .muted { color: #6b7280; font-size: 12px; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 12px; }
  .score { font-size: 44px; font-weight: 700; line-height: 1; }
  .score-good { color: #059669; } .score-warn { color: #d97706; } .score-bad { color: #dc2626; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; page-break-inside: avoid; }
  .findings { list-style: none; padding: 0; margin: 6px 0 0; }
  .findings li { display: flex; gap: 8px; padding: 4px 0; font-size: 12px; border-top: 1px dashed #f1f5f9; }
  .findings li:first-child { border-top: none; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; border: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.02em; }
  .badge.pass { color: #059669; border-color: #a7f3d0; }
  .badge.warn { color: #d97706; border-color: #fde68a; }
  .badge.fail { color: #dc2626; border-color: #fecaca; }
  .badge.info { color: #6b7280; }
  .fixes { list-style: decimal; padding-left: 18px; margin: 6px 0 0; font-size: 12px; color: #374151; }
  .fix { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; margin-top: 6px; }
  @media print {
    body { padding: 12mm; }
    .card, .fix { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }
  .toolbar { position: sticky; top: 0; background: #fff; padding: 8px 0 16px; margin: -12px 0 12px; border-bottom: 1px solid #e5e7eb; display: flex; gap: 8px; }
  .toolbar button { border: 1px solid #d1d5db; background: #f9fafb; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
  @media print { .toolbar { display: none; } }
</style>
</head><body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><span class="muted">Use your browser's print dialog to save as PDF.</span></div>
<div class="row">
  <div>
    <h1>${esc(report.title)}</h1>
    <div class="muted">${esc(report.subtitle ?? "")}</div>
    <div class="muted">${report.type.replace("_", " ")} · ${esc(report.finished_at ?? "")}</div>
  </div>
  <div style="text-align:right"><div class="muted">Overall score</div><div class="score ${scoreCls(summary.overall)}">${summary.overall}</div></div>
</div>

<h2>Category scores</h2>
<div class="grid">
  ${summary.categories.map((c) => `<div class="card"><div style="display:flex;justify-content:space-between"><strong>${esc(c.category)}</strong><span class="${scoreCls(c.score)}"><strong>${c.score}</strong></span></div><div class="muted">${c.findings} checks · ${c.failing} to fix</div></div>`).join("")}
</div>

${summary.priorityIssues.length ? `<h2>Priority issues</h2><ol style="padding-left:18px">${summary.priorityIssues.map((p) => `<li><strong>${esc(p.label)}</strong> — <span class="badge ${p.status}">${p.status}</span> <span class="muted">${esc(p.section)}</span>${p.detail ? `<div class="muted">${esc(p.detail)}</div>` : ""}</li>`).join("")}</ol>` : ""}

<h2>Sections</h2>
${report.sections.map((section) => {
  const rec = recs.get(section.id);
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3 style="margin:0">${esc(section.title)}</h3>
      ${typeof section.score === "number" ? `<span class="${scoreCls(section.score)}"><strong>${section.score}</strong></span>` : ""}
    </div>
    ${section.findings.length ? `<ul class="findings">${section.findings.map((f) => `<li><span class="badge ${f.status}">${f.status}</span><div><strong>${esc(f.label)}</strong>${f.detail ? `<div class="muted">${esc(f.detail)}</div>` : ""}${f.value != null && f.value !== "" ? `<div class="muted">${esc(f.value)}</div>` : ""}</div></li>`).join("")}</ul>` : ""}
    ${rec ? `<div style="margin-top:10px;border-top:1px solid #e5e7eb;padding-top:8px"><div class="muted" style="margin-bottom:6px">AI recommendations</div>${rec.summary ? `<p style="font-size:12px;color:#374151;margin:0 0 6px">${esc(rec.summary)}</p>` : ""}${rec.fixes.map((fix) => `<div class="fix"><strong>${esc(fix.title)}</strong> <span class="badge info">impact ${esc(fix.impact)}</span> <span class="badge info">effort ${esc(fix.effort)}</span><ol class="fixes">${fix.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`).join("")}</div>` : ""}
  </div>`;
}).join("")}

</body></html>`;
}

export const Route = createFileRoute("/api/reports/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const reportType = (url.searchParams.get("type") ?? "audit") as "audit" | "site_audit" | "tool_run";
        const shareToken = url.searchParams.get("token");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Access control: signed-in user (bearer) OR valid share token.
        let authorized = false;

        if (shareToken) {
          const { data: share } = await supabaseAdmin
            .from("report_shares")
            .select("report_id,report_type,expires_at")
            .eq("token", shareToken)
            .maybeSingle();
          if (share && String(share.report_id) === params.id && String(share.report_type) === reportType) {
            const expiresAt = new Date(String(share.expires_at));
            if (expiresAt.getTime() > Date.now()) authorized = true;
          }
        }

        if (!authorized) {
          const authHeader = request.headers.get("authorization") ?? "";
          const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (jwt) {
            const { data: u } = await supabaseAdmin.auth.getUser(jwt);
            const uid = u.user?.id;
            if (uid) {
              const table = reportType === "audit" ? "audits" : reportType === "site_audit" ? "site_audits" : "tool_runs";
              const { data: row } = await supabaseAdmin.from(table).select("id,user_id").eq("id", params.id).maybeSingle();
              if (row && (row as { user_id: string }).user_id === uid) authorized = true;
            }
          }
        }

        if (!authorized) return new Response("Unauthorized", { status: 401 });

        const table = reportType === "audit" ? "audits" : reportType === "site_audit" ? "site_audits" : "tool_runs";
        const { data: row, error } = await supabaseAdmin.from(table).select("*").eq("id", params.id).maybeSingle();
        if (error || !row) return new Response("Report not found", { status: 404 });

        const report =
          reportType === "audit" ? normalizeAudit(row as Record<string, unknown>)
          : reportType === "site_audit" ? normalizeSiteAudit(row as Record<string, unknown>)
          : normalizeToolRun(row as Record<string, unknown>);

        const { data: recRows } = await supabaseAdmin
          .from("report_recommendations")
          .select("section_slug,summary,fixes")
          .eq("report_id", params.id)
          .eq("report_type", reportType);
        const recs = new Map<string, { summary: string; fixes: Array<{ title: string; impact: string; effort: string; steps: string[] }> }>();
        for (const r of (recRows ?? []) as Array<{ section_slug: string; summary: string; fixes: Array<{ title: string; impact: string; effort: string; steps: string[] }> }>) {
          recs.set(r.section_slug, { summary: r.summary, fixes: r.fixes });
        }

        return new Response(renderHtml(report, recs), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});