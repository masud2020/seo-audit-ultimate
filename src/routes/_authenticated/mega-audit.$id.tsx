import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMegaAudit } from "@/lib/mega-audit.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ExternalLink, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mega-audit/$id")({ component: Detail });

type Check = { id: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail?: string; value?: string | number | null };
type Section = { id: string; title: string; score: number; checks: Check[] };
type PageReport = { url: string; final_url: string; overall_score: number; sections: Section[] };
type Competitor = { url: string; overall_score: number | null; page_report?: PageReport | null; semrush?: Section | null; ai?: Section | null; error?: string };
type Results = {
  target_url: string;
  competitor_url?: string | null;
  target_keyword?: string | null;
  finished_at: string;
  page: PageReport;
  site: { summary: { overall_score: number; pages_audited: number; pages_failed: number; avg_by_section: Record<string, number>; issue_counts: { high: number; medium: number; low: number }; top_problems: { message: string; count: number; severity: "high" | "medium" | "low" }[] }; pages: { url: string; overall_score: number | null }[]; issues: { url: string; severity: "high" | "medium" | "low"; message: string }[] };
  site_signals: Section[];
  competitor?: Competitor | null;
  mega_score: number;
  score_breakdown: { label: string; score: number; weight: number }[];
  priority_actions: { severity: "high" | "medium" | "low"; message: string; count?: number; source: string }[];
};

function scoreCls(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}
function statusDot(status: string) {
  const c = status === "pass" ? "text-emerald-400" : status === "warn" ? "text-amber-400" : status === "fail" ? "text-rose-400" : "text-muted-foreground";
  return <span className={c}>●</span>;
}

function SectionCard({ section }: { section: Section }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{section.title}</div>
        <div className={`text-sm font-semibold ${scoreCls(section.score)}`}>{section.score}</div>
      </div>
      <ul className="space-y-1 text-xs">
        {section.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            {statusDot(c.status)}
            <div className="flex-1">
              <div className="font-medium">{c.label}{c.value != null && c.value !== "" && <span className="text-muted-foreground"> — {String(c.value)}</span>}</div>
              {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Detail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getMegaAudit);
  const { data, isLoading } = useQuery({
    queryKey: ["mega-audit", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (q) => {
      const d = q.state.data as { status?: string } | undefined;
      return d?.status === "running" || d?.status === "pending" ? 2500 : false;
    },
  });

  if (isLoading || !data) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading mega audit…</div>;

  if (data.status === "running" || data.status === "pending") {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <Sparkles className="h-8 w-8 mx-auto text-primary" />
        <h2 className="text-lg font-semibold truncate">Running mega audit for {data.target_url}</h2>
        <p className="text-sm text-muted-foreground">{data.status_message ?? "Working…"}</p>
        <Progress value={data.progress ?? 0} className="h-2" />
        <p className="text-xs text-muted-foreground">{data.progress ?? 0}%</p>
      </div>
    );
  }
  if (data.status === "error") {
    return <Card className="p-6"><h2 className="text-lg font-semibold text-rose-400">Mega audit failed</h2><p className="text-sm text-muted-foreground mt-1">{data.error ?? "Unknown error"}</p></Card>;
  }

  const r = data.results as unknown as Results;
  const summary = r.site.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Mega Audit — {r.target_url}
            <a href={r.target_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
          </h1>
          <p className="text-xs text-muted-foreground">
            Finished {new Date(r.finished_at).toLocaleString()}
            {r.competitor_url && <> · vs {r.competitor_url}</>}
            {r.target_keyword && <> · keyword “{r.target_keyword}”</>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Mega score</div>
          <div className={`text-5xl font-bold ${scoreCls(r.mega_score)}`}>{r.mega_score}</div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="grid gap-3 md:grid-cols-4">
        {r.score_breakdown.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={`text-2xl font-semibold ${scoreCls(s.score)}`}>{s.score}</div>
            <div className="text-[10px] text-muted-foreground">weight {(s.weight * 100).toFixed(0)}%</div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Priority actions ({r.priority_actions.length})</TabsTrigger>
          <TabsTrigger value="page">Homepage audit</TabsTrigger>
          <TabsTrigger value="site">Whole-site audit</TabsTrigger>
          <TabsTrigger value="signals">External signals</TabsTrigger>
          {r.competitor && <TabsTrigger value="competitor">Competitor</TabsTrigger>}
        </TabsList>

        <TabsContent value="actions">
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 w-24">Severity</th><th className="px-4 py-2">Issue</th><th className="px-4 py-2 w-32">Source</th><th className="px-4 py-2 w-24">Pages</th></tr>
              </thead>
              <tbody>
                {r.priority_actions.map((a, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-2"><Badge variant={a.severity === "high" ? "destructive" : a.severity === "medium" ? "secondary" : "outline"}>{a.severity}</Badge></td>
                    <td className="px-4 py-2">{a.message}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{a.source}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{a.count ?? "—"}</td>
                  </tr>
                ))}
                {r.priority_actions.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No priority issues found. Nice work.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="page">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm">Overall page score</div>
            <div className={`text-xl font-semibold ${scoreCls(r.page.overall_score)}`}>{r.page.overall_score}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {r.page.sections.map((s) => <SectionCard key={s.id} section={s} />)}
          </div>
        </TabsContent>

        <TabsContent value="site">
          <div className="grid gap-3 md:grid-cols-4 mb-3">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Site score</div><div className={`text-xl font-semibold ${scoreCls(summary.overall_score)}`}>{summary.overall_score}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Pages audited</div><div className="text-xl font-semibold">{summary.pages_audited}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">High issues</div><div className="text-xl font-semibold text-rose-400">{summary.issue_counts.high}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Medium issues</div><div className="text-xl font-semibold text-amber-400">{summary.issue_counts.medium}</div></Card>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(summary.avg_by_section).map(([id, sc]) => (
              <Card key={id} className="p-3">
                <div className="flex items-center justify-between mb-1"><div className="text-sm font-medium capitalize">{id}</div><div className={`text-sm font-semibold ${scoreCls(sc)}`}>{sc}</div></div>
                <Progress value={sc} className="h-1" />
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="signals">
          <div className="grid gap-3 md:grid-cols-2">
            {r.site_signals.map((s) => <SectionCard key={s.id} section={s} />)}
            {r.site_signals.length === 0 && <p className="text-sm text-muted-foreground">No external signals available.</p>}
          </div>
        </TabsContent>

        {r.competitor && (
          <TabsContent value="competitor">
            <div className="grid gap-3 md:grid-cols-3 mb-3">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Your score</div>
                <div className={`text-2xl font-semibold ${scoreCls(r.page.overall_score)}`}>{r.page.overall_score}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Competitor score</div>
                <div className={`text-2xl font-semibold ${scoreCls(r.competitor.overall_score)}`}>{r.competitor.overall_score ?? "—"}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Gap</div>
                <div className={`text-2xl font-semibold ${r.competitor.overall_score == null ? "text-muted-foreground" : r.page.overall_score >= r.competitor.overall_score ? "text-emerald-400" : "text-rose-400"}`}>
                  {r.competitor.overall_score == null ? "—" : `${r.page.overall_score - r.competitor.overall_score > 0 ? "+" : ""}${r.page.overall_score - r.competitor.overall_score}`}
                </div>
              </Card>
            </div>
            {r.competitor.error && <Card className="p-4 mb-3"><p className="text-sm text-rose-400">Competitor audit error: {r.competitor.error}</p></Card>}
            <div className="grid gap-3 md:grid-cols-2">
              {r.competitor.semrush && <SectionCard section={r.competitor.semrush} />}
              {r.competitor.ai && <SectionCard section={r.competitor.ai} />}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
