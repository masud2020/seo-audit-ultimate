import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAudit } from "@/lib/audit.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Info, Download, ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit/$id")({ component: AuditPage });

interface Check { id: string; label: string; status: "pass"|"warn"|"fail"|"info"; detail?: string; value?: string | number | null; }
interface Section { id: string; title: string; score: number; checks: Check[]; data?: Record<string, unknown> }
interface Report { url: string; final_url: string; fetched_at: string; overall_score: number; sections: Section[]; meta: { status_code: number; duration_ms: number; bytes: number; content_type: string | null } }
interface AiRec { section: string; title: string; recommendations: string[] }

function statusIcon(s: Check["status"]) {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-rose-400" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}
function scoreClass(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}

function AuditPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAudit);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (q) => {
      const d = q.state.data as { status?: string } | undefined;
      return d?.status === "running" || d?.status === "pending" ? 2500 : false;
    },
  });

  if (isLoading || !data) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading audit…</div>;

  if (data.status === "running" || data.status === "pending") {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <h2 className="mt-4 text-lg font-semibold">Auditing {data.url}</h2>
        <p className="text-sm text-muted-foreground mt-1">This can take up to a minute. Results are saved automatically.</p>
      </div>
    );
  }
  if (data.status === "error") {
    return <Card className="p-6"><h2 className="text-lg font-semibold text-rose-400">Audit failed</h2><p className="text-sm text-muted-foreground mt-1">{data.error ?? "Unknown error"}</p><Button onClick={() => refetch()} className="mt-3">Retry</Button></Card>;
  }

  const report = data.sections as unknown as Report;
  const recs = (data.ai_recommendations ?? []) as unknown as AiRec[];

  const download = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const html = buildPrintable(report, recs);
    w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold truncate max-w-xl">{report.url}</h1>
            <a href={report.final_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
          </div>
          <p className="text-xs text-muted-foreground">Audited {new Date(report.fetched_at).toLocaleString()} · HTTP {report.meta.status_code} · {report.meta.duration_ms}ms · {(report.meta.bytes/1024).toFixed(1)}KB</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Overall score</div>
            <div className={`text-3xl font-bold ${scoreClass(report.overall_score)}`}>{report.overall_score}</div>
          </div>
          <Button variant="outline" onClick={download}><Download className="h-4 w-4 mr-2" />Export PDF</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {report.sections.map(s => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <span className={`text-sm font-semibold ${scoreClass(s.score)}`}>{s.score}</span>
            </div>
            <ul className="space-y-1.5">
              {s.checks.map(c => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  {statusIcon(c.status)}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{c.label}</div>
                    {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
                    {c.value != null && c.value !== "" && <div className="text-muted-foreground truncate">{String(c.value).slice(0,140)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {recs.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">AI Recommendations <Badge variant="secondary">{recs.length}</Badge></h2>
          <div className="grid gap-3 md:grid-cols-2">
            {recs.map(r => (
              <div key={r.section} className="rounded-md border border-border p-3">
                <div className="text-xs font-semibold mb-2">{r.title}</div>
                <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                  {r.recommendations.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function buildPrintable(r: Report, recs: AiRec[]): string {
  const secHtml = r.sections.map(s => `
    <section><h2>${s.title} <span style="float:right">${s.score}</span></h2>
    <ul>${s.checks.map(c => `<li><b>[${c.status.toUpperCase()}]</b> ${c.label}${c.detail?` — ${c.detail}`:""}${c.value?` <em>${String(c.value).slice(0,120)}</em>`:""}</li>`).join("")}</ul></section>`).join("");
  const recHtml = recs.map(rc => `<section><h3>${rc.title}</h3><ul>${rc.recommendations.map(x=>`<li>${x}</li>`).join("")}</ul></section>`).join("");
  return `<!doctype html><html><head><title>SEO Audit — ${r.url}</title><style>
    body{font-family:system-ui,sans-serif;max-width:900px;margin:2em auto;padding:0 1em;color:#111}
    h1{margin:0} h2{border-bottom:1px solid #ccc;padding-bottom:.25em;margin-top:1.5em}
    section{margin-bottom:1em} ul{margin:.25em 0 .5em 1.2em}
    .score{font-size:2em;font-weight:700;color:#0a0}
  </style></head><body>
    <h1>SEO Audit Report</h1>
    <p>${r.url}<br><small>Audited ${new Date(r.fetched_at).toLocaleString()}</small></p>
    <div class="score">Overall: ${r.overall_score}/100</div>
    ${secHtml}
    <h2>AI Recommendations</h2>${recHtml}
  </body></html>`;
}