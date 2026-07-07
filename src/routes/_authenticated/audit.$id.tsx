import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAudit } from "@/lib/audit.functions";
import { generateAuditPdf, emailAuditPdf } from "@/lib/pdf.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Info, Download, ExternalLink, Loader2, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExecutiveSummary } from "@/components/reports/ExecutiveSummary";
import { AiRecommendationsPanel } from "@/components/reports/AiRecommendationsPanel";
import { normalizeAudit } from "@/lib/report-core";

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
  const pdf = useServerFn(generateAuditPdf);
  const mail = useServerFn(emailAuditPdf);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (q) => {
      const d = q.state.data as { status?: string } | undefined;
      return d?.status === "running" || d?.status === "pending" ? 2500 : false;
    },
  });

  const mPdf = useMutation({
    mutationFn: () => pdf({ data: { audit_id: id } }),
    onSuccess: (d) => {
      const bytes = Uint8Array.from(atob(d.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = d.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "PDF failed"),
  });
  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const mMail = useMutation({
    mutationFn: () => mail({ data: { audit_id: id, to, note } }),
    onSuccess: () => { toast.success(`Report sent to ${to}`); setEmailOpen(false); setTo(""); setNote(""); },
    onError: e => toast.error(e instanceof Error ? e.message : "Email failed"),
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
  const normalized = normalizeAudit(data as unknown as Record<string, unknown>);

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
          <Button variant="outline" onClick={() => mPdf.mutate()} disabled={mPdf.isPending}>{mPdf.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Export PDF</Button>
          <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
            <DialogTrigger asChild><Button variant="outline"><Mail className="h-4 w-4 mr-2" />Email PDF</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Email audit report</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Recipient email</Label><Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" /></div>
                <div><Label>Note (optional)</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Here's your monthly SEO audit…" /></div>
                <p className="text-xs text-muted-foreground">Sends via the Brevo connector using the sender email you configured in Settings.</p>
              </div>
              <DialogFooter><Button onClick={() => mMail.mutate()} disabled={!to || mMail.isPending}>{mMail.isPending ? "Sending…" : "Send"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ExecutiveSummary report={normalized} />

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

      <AiRecommendationsPanel report={normalized} />

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