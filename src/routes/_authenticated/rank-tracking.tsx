import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rankOverview, updateKeywordAlert } from "@/lib/phase3.functions";
import { refreshKeyword } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rank-tracking")({ component: RankTracking });

interface HistPoint { position: number; checked_at: string }

function RankTracking() {
  const qc = useQueryClient();
  const load = useServerFn(rankOverview);
  const refresh = useServerFn(refreshKeyword);
  const setAlert = useServerFn(updateKeywordAlert);
  const q = useQuery({ queryKey: ["rank-overview"], queryFn: () => load() });
  const [selected, setSelected] = useState<string | null>(null);

  const mRefresh = useMutation({
    mutationFn: (id: string) => refresh({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rank-overview"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const mAlert = useMutation({
    mutationFn: (v: { id: string; alert_threshold: number }) => setAlert({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rank-overview"] }),
  });

  const rows = q.data?.rows ?? [];
  const active = useMemo(() => rows.find(r => r.id === selected) ?? rows[0], [rows, selected]);
  const history: HistPoint[] = useMemo(() => Array.isArray(active?.history) ? (active!.history as unknown as HistPoint[]) : [], [active]);
  const chart = history.map(h => ({ date: new Date(h.checked_at).toLocaleDateString(), position: h.position }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SERP Tracking</h1>
        <p className="text-sm text-muted-foreground">Chart keyword rank over time. Alerts fire when a keyword drops by the configured threshold.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Keywords tracked" value={q.data?.tracked ?? 0} />
        <Stat label="Avg. position" value={q.data?.avg ?? "—"} />
        <Stat label="Top 10" value={q.data?.top10 ?? 0} />
        <Stat label="Top 3" value={q.data?.top3 ?? 0} />
      </div>

      {q.data && q.data.alerts.length > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-2"><AlertTriangle className="h-4 w-4" />Rank drop alerts</div>
          <ul className="space-y-1 text-xs">
            {q.data.alerts.map(k => (
              <li key={k.id}>
                <span className="font-medium">{k.keyword}</span>: {k.previous_position} → {k.current_position}
                <span className="text-rose-400"> (−{(k.current_position ?? 0) - (k.previous_position ?? 0)})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-0 divide-y divide-border max-h-[520px] overflow-auto">
          {rows.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No keywords tracked. Add some in Keyword Rank Tracker.</div>}
          {rows.map(k => {
            const diff = k.current_position != null && k.previous_position != null ? k.previous_position - k.current_position : 0;
            const isSel = active?.id === k.id;
            return (
              <button key={k.id} onClick={() => setSelected(k.id)} className={`w-full text-left p-3 flex items-center gap-3 text-sm hover:bg-muted/40 ${isSel ? "bg-muted/60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{k.keyword}</div>
                  <div className="text-xs text-muted-foreground truncate">{k.target_url}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-semibold">{k.current_position ?? "—"}</div>
                  {diff !== 0 && <div className={`text-xs flex items-center gap-1 justify-end ${diff > 0 ? "text-emerald-400" : "text-rose-400"}`}>{diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(diff)}</div>}
                </div>
                <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); mRefresh.mutate(k.id); }} disabled={mRefresh.isPending}><RefreshCw className={`h-3.5 w-3.5 ${mRefresh.isPending ? "animate-spin" : ""}`} /></Button>
              </button>
            );
          })}
        </Card>
        <Card className="p-4">
          {active ? (
            <>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="text-sm font-semibold">{active.keyword}</div>
                  <div className="text-xs text-muted-foreground">{active.target_url}</div>
                </div>
                <Badge variant="outline">#{active.current_position ?? "—"}</Badge>
              </div>
              <div className="h-64">
                {chart.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis reversed domain={[1, 100]} fontSize={10} />
                      <Tooltip />
                      <Line type="monotone" dataKey="position" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="text-xs text-muted-foreground flex items-center justify-center h-full">Not enough data yet — refresh a few times.</div>}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Alert if drops by</label>
                  <Input type="number" min={1} max={100} defaultValue={active.alert_threshold ?? 5} onBlur={(e) => {
                    const v = Math.max(1, Math.min(100, Number(e.target.value)));
                    if (v !== active.alert_threshold) mAlert.mutate({ id: active.id, alert_threshold: v });
                  }} className="h-8" />
                </div>
                <div className="text-xs text-muted-foreground pb-2">positions</div>
              </div>
            </>
          ) : <div className="text-sm text-muted-foreground">Select a keyword to view history.</div>}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div></Card>;
}