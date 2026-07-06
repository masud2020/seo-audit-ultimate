import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardSummary } from "@/lib/audit.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, TrendingUp, FileText, AlertTriangle } from "lucide-react";
import { ALGORITHM_UPDATES } from "@/lib/data/algorithm-updates";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function scoreColor(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}

function Dashboard() {
  const fn = useServerFn(dashboardSummary);
  const { data, isLoading } = useQuery({ queryKey: ["dash"], queryFn: () => fn() });
  const upcoming = ALGORITHM_UPDATES.slice(0, 4);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your recent SEO activity.</p>
        </div>
        <Link to="/audit/new"><Button><PlayCircle className="h-4 w-4 mr-2" />New Audit</Button></Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3"><FileText className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total audits</span></div>
          <div className="mt-2 text-3xl font-semibold">{isLoading ? "…" : data?.total ?? 0}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><TrendingUp className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Average score</span></div>
          <div className={`mt-2 text-3xl font-semibold ${scoreColor(data?.avg_score)}`}>{isLoading ? "…" : data?.avg_score ?? "—"}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><AlertTriangle className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Recent audits</span></div>
          <div className="mt-2 text-3xl font-semibold">{isLoading ? "…" : data?.recent?.length ?? 0}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Recent audits</h2>
          {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> :
            (data?.recent?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground">No audits yet. <Link className="text-primary underline" to="/audit/new">Start your first audit</Link>.</p> : (
            <ul className="divide-y divide-border">
              {data!.recent.map(r => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <Link to="/audit/$id" params={{ id: r.id }} className="block text-sm truncate hover:underline">{r.url}</Link>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{r.status}</Badge>
                    <span className={`text-sm font-semibold ${scoreColor(r.overall_score)}`}>{r.overall_score ?? "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Latest Google algorithm updates</h2>
          <ul className="divide-y divide-border">
            {upcoming.map(u => (
              <li key={u.date} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.date}</span>
                </div>
                <p className="text-xs text-muted-foreground">{u.summary}</p>
              </li>
            ))}
          </ul>
          <Link to="/calendar" className="mt-3 inline-block text-xs text-primary hover:underline">Open calendar →</Link>
        </Card>
      </div>
    </div>
  );
}