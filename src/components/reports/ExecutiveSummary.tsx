import { CheckCircle2, AlertTriangle, XCircle, Info, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { NormalizedReport } from "@/lib/report-core";
import { summarize } from "@/lib/report-core";

function scoreCls(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" | "info" }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-rose-400 shrink-0" />;
  return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function ExecutiveSummary({ report }: { report: NormalizedReport }) {
  const summary = summarize(report);
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Executive summary</div>
          <h2 className="text-lg font-semibold mt-1 truncate max-w-xl">{report.title}</h2>
          {report.subtitle && <p className="text-xs text-muted-foreground truncate max-w-xl">{report.subtitle}</p>}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Overall score</div>
          <div className={`text-4xl font-bold ${scoreCls(summary.overall)}`}>{summary.overall}</div>
          <div className="text-[10px] text-muted-foreground uppercase">{gradeFor(summary.overall)}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Passing" value={summary.totals.pass} tone="emerald" />
        <StatCard label="Warnings" value={summary.totals.warn} tone="amber" />
        <StatCard label="Failing" value={summary.totals.fail} tone="rose" />
        <StatCard label="Info" value={summary.totals.info} tone="muted" />
      </div>

      <div>
        <div className="text-xs font-medium mb-2 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Category scores</div>
        <div className="grid gap-2 md:grid-cols-2">
          {summary.categories.map((c) => (
            <div key={c.category} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">{c.category}</div>
                <div className={`text-sm font-semibold ${scoreCls(c.score)}`}>{c.score}</div>
              </div>
              <Progress value={c.score} className="h-1" />
              <div className="mt-1 text-[10px] text-muted-foreground">
                {c.findings} checks · {c.failing} to fix
              </div>
            </div>
          ))}
        </div>
      </div>

      {summary.priorityIssues.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2">Priority issues</div>
          <ul className="rounded-md border border-border divide-y divide-border">
            {summary.priorityIssues.map((p, i) => (
              <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                <StatusIcon status={p.status} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.label}</div>
                  {p.detail && <div className="text-xs text-muted-foreground truncate">{p.detail}</div>}
                </div>
                <Badge variant="outline" className="text-[10px]">{p.section}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" | "muted" }) {
  const cls =
    tone === "emerald" ? "text-emerald-400"
    : tone === "amber" ? "text-amber-400"
    : tone === "rose" ? "text-rose-400"
    : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function gradeFor(s: number): string {
  if (s >= 90) return "Excellent";
  if (s >= 80) return "Good";
  if (s >= 60) return "Needs work";
  return "Poor";
}