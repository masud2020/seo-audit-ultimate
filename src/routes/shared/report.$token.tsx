// Public read-only view of a shared report. Server fn `resolveReportShare`
// validates the token via the admin client and returns a stripped row.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { resolveReportShare } from "@/lib/report-share.functions";
import { normalizeAudit, normalizeSiteAudit, normalizeToolRun } from "@/lib/report-core";
import { ExecutiveSummary } from "@/components/reports/ExecutiveSummary";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";

export const Route = createFileRoute("/shared/report/$token")({
  head: () => ({
    meta: [
      { title: "Shared report — SEO Audit Tool" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Read-only shared report." },
    ],
  }),
  component: SharedReport,
});

function icon(s: "pass" | "warn" | "fail" | "info") {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-rose-400" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function SharedReport() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveReportShare);
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-report", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
  });

  if (isLoading) return <div className="p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (error || !data) return <div className="p-10 text-center text-sm text-rose-400">Share link is invalid or expired.</div>;

  const row = data.report as Record<string, unknown>;
  const report =
    data.report_type === "audit" ? normalizeAudit(row)
    : data.report_type === "site_audit" ? normalizeSiteAudit(row)
    : normalizeToolRun(row);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Read-only shared report · expires {new Date(data.expires_at).toLocaleDateString()}</div>
        <Badge variant="outline">Public</Badge>
      </div>
      <ExecutiveSummary report={report} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {report.sections.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              {typeof s.score === "number" && <span className="text-sm font-semibold">{s.score}</span>}
            </div>
            <ul className="space-y-1.5">
              {s.findings.slice(0, 60).map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-xs">
                  {icon(f.status)}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{f.label}</div>
                    {f.detail && <div className="text-muted-foreground">{f.detail}</div>}
                    {f.value != null && f.value !== "" && <div className="text-muted-foreground truncate">{String(f.value).slice(0, 140)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}