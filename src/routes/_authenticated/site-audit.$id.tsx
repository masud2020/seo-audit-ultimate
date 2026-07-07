import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSiteAudit } from "@/lib/site-audit.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExecutiveSummary } from "@/components/reports/ExecutiveSummary";
import { ExportMenu } from "@/components/reports/ExportMenu";
import { AiRecommendationsPanel } from "@/components/reports/AiRecommendationsPanel";
import { normalizeSiteAudit } from "@/lib/report-core";

export const Route = createFileRoute("/_authenticated/site-audit/$id")({ component: Detail });

type Summary = {
  start_url: string;
  pages_audited: number;
  pages_failed: number;
  overall_score: number;
  avg_by_section: Record<string, number>;
  issue_counts: { high: number; medium: number; low: number };
  top_problems: { message: string; count: number; severity: "high" | "medium" | "low" }[];
  finished_at: string;
};
type Page = { url: string; status: number; overall_score: number | null; duration_ms: number; section_scores: Record<string, number>; top_issues: { id: string; label: string; status: string; detail?: string }[]; error?: string };
type Issue = { url: string; severity: "high" | "medium" | "low"; message: string; source: "crawl" | "audit" };
type SignalCheck = { id: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail?: string; value?: string | number | null };
type SignalSection = { id: string; title: string; score: number; checks: SignalCheck[] };

function scoreCls(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}

function Detail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getSiteAudit);
  const { data, isLoading } = useQuery({
    queryKey: ["site-audit", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (q) => {
      const d = q.state.data as { status?: string } | undefined;
      return d?.status === "running" || d?.status === "pending" ? 3000 : false;
    },
  });

  if (isLoading || !data) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading site audit…</div>;

  if (data.status === "running" || data.status === "pending") {
    const pct = data.max_pages ? Math.round((data.pages_audited / data.max_pages) * 100) : 0;
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <h2 className="text-lg font-semibold truncate">Auditing {data.start_url}</h2>
        <p className="text-sm text-muted-foreground">{data.pages_audited} / {data.max_pages} pages complete</p>
        <Progress value={pct} className="h-1.5" />
      </div>
    );
  }
  if (data.status === "error") {
    return <Card className="p-6"><h2 className="text-lg font-semibold text-rose-400">Site audit failed</h2><p className="text-sm text-muted-foreground mt-1">{data.error ?? "Unknown error"}</p></Card>;
  }

  const summary = data.summary as unknown as Summary;
  const pages = (data.pages as unknown as Page[]) ?? [];
  const issues = (data.issues as unknown as Issue[]) ?? [];
  const siteSignals = ((data.summary as unknown as { site_signals?: SignalSection[] })?.site_signals) ?? [];
  const normalized = normalizeSiteAudit(data as unknown as Record<string, unknown>);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold truncate max-w-xl flex items-center gap-2">
            {data.start_url}
            <a href={data.start_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
          </h1>
          <p className="text-xs text-muted-foreground">Finished {new Date(summary.finished_at).toLocaleString()} · {summary.pages_audited} pages · {summary.pages_failed} failed</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportMenu report={normalized} />
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Overall site score</div>
            <div className={`text-4xl font-bold ${scoreCls(summary.overall_score)}`}>{summary.overall_score}</div>
          </div>
        </div>
      </div>

      <ExecutiveSummary report={normalized} />

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pages</div><div className="text-2xl font-semibold">{summary.pages_audited}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">High-severity issues</div><div className="text-2xl font-semibold text-rose-400">{summary.issue_counts.high}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Medium</div><div className="text-2xl font-semibold text-amber-400">{summary.issue_counts.medium}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Low</div><div className="text-2xl font-semibold text-muted-foreground">{summary.issue_counts.low}</div></Card>
      </div>

      <AiRecommendationsPanel report={normalized} />

      {siteSignals.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Site-wide external signals</h2>
            <p className="text-xs text-muted-foreground">Live data from PageSpeed Insights, Google Search Console, Semrush and leading AI models.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {siteSignals.map((sig) => (
              <Card key={sig.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{sig.title}</div>
                  <div className={`text-sm font-semibold ${scoreCls(sig.score)}`}>{sig.score}</div>
                </div>
                <ul className="space-y-1 text-xs">
                  {sig.checks.map((c) => (
                    <li key={c.id} className="flex gap-2">
                      <span className={
                        c.status === "pass" ? "text-emerald-400" :
                        c.status === "warn" ? "text-amber-400" :
                        c.status === "fail" ? "text-rose-400" : "text-muted-foreground"
                      }>●</span>
                      <div className="flex-1">
                        <div className="font-medium">
                          {c.label}
                          {c.value != null && c.value !== "" && <span className="text-muted-foreground"> — {String(c.value)}</span>}
                        </div>
                        {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Section averages</TabsTrigger>
          <TabsTrigger value="problems">Top problems</TabsTrigger>
          <TabsTrigger value="pages">Pages ({pages.length})</TabsTrigger>
          <TabsTrigger value="issues">All issues ({issues.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sections">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(summary.avg_by_section).map(([id, score]) => (
              <Card key={id} className="p-4">
                <div className="flex items-center justify-between mb-1"><div className="text-sm font-medium capitalize">{id}</div><div className={`text-sm font-semibold ${scoreCls(score)}`}>{score}</div></div>
                <Progress value={score} className="h-1" />
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="problems">
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">Problem</th><th className="px-4 py-2">Severity</th><th className="px-4 py-2">Affected pages</th></tr>
              </thead>
              <tbody>
                {summary.top_problems.map((p, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-2">{p.message}</td>
                    <td className="px-4 py-2"><Badge variant={p.severity === "high" ? "destructive" : p.severity === "medium" ? "secondary" : "outline"}>{p.severity}</Badge></td>
                    <td className="px-4 py-2 font-mono">{p.count}</td>
                  </tr>
                ))}
                {summary.top_problems.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No recurring problems detected.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="pages">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">URL</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Time</th><th className="px-4 py-2">Issues</th></tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.url} className="border-b border-border/50">
                    <td className="px-4 py-2 truncate max-w-md"><a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a></td>
                    <td className="px-4 py-2">{p.status || (p.error ? <span className="text-rose-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />err</span> : "—")}</td>
                    <td className={`px-4 py-2 font-semibold ${scoreCls(p.overall_score)}`}>{p.overall_score ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.duration_ms}ms</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.top_issues.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="issues">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">Severity</th><th className="px-4 py-2">Message</th><th className="px-4 py-2">URL</th><th className="px-4 py-2">Source</th></tr>
              </thead>
              <tbody>
                {issues.map((i, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="px-4 py-2"><Badge variant={i.severity === "high" ? "destructive" : i.severity === "medium" ? "secondary" : "outline"}>{i.severity}</Badge></td>
                    <td className="px-4 py-2">{i.message}</td>
                    <td className="px-4 py-2 truncate max-w-xs"><a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">{i.url}</a></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{i.source}</td>
                  </tr>
                ))}
                {issues.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No issues.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}