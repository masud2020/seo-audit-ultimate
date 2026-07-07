import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startMegaAudit, listMegaAudits, deleteMegaAudit } from "@/lib/mega-audit.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Trash2, Eye, Sparkles } from "lucide-react";

type Row = {
  id: string; target_url: string; competitor_url: string | null; status: string;
  progress: number; status_message: string | null; overall_score: number | null;
  max_pages: number; created_at: string; error: string | null;
};

export const Route = createFileRoute("/_authenticated/mega-audit")({ component: MegaAuditPage });

function scoreCls(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}

function MegaAuditPage() {
  const start = useServerFn(startMegaAudit);
  const list = useServerFn(listMegaAudits);
  const del = useServerFn(deleteMegaAudit);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["mega-audits"],
    queryFn: () => list(),
    refetchInterval: (q) => {
      const rows = (q.state.data as Row[] | undefined) ?? [];
      return rows.some((r) => r.status === "running" || r.status === "pending") ? 3000 : false;
    },
  });
  const [target, setTarget] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [keyword, setKeyword] = useState("");
  const [max, setMax] = useState(25);
  const m = useMutation({
    mutationFn: () => start({ data: { target_url: target, competitor_url: competitor || null, target_keyword: keyword || null, max_pages: max } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["mega-audits"] }); navigate({ to: "/mega-audit/$id", params: { id: r.id } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Mega audit failed"),
  });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["mega-audits"] }) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Sparkles className="h-6 w-6" />Mega Audit</h1>
        <p className="text-sm text-muted-foreground">The full SEO stack in one run — single-page audit, whole-site crawl, PageSpeed / Core Web Vitals, Google Search Console, Semrush, AI visibility, and an optional competitor comparison. One unified score, one downloadable report.</p>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (target) m.mutate(); }}>
          <div>
            <label className="text-xs text-muted-foreground">Target URL</label>
            <Input placeholder="https://yoursite.com" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Competitor URL (optional)</label>
            <Input placeholder="https://competitor.com" value={competitor} onChange={(e) => setCompetitor(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Target keyword (optional)</label>
            <Input placeholder="e.g. best seo audit tool" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Max pages to crawl</label>
            <Input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value) || 25)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button disabled={m.isPending || !target}>
              {m.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Launching…</> : <><Play className="h-4 w-4 mr-2" />Start Mega Audit</>}
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground mt-3">Runs in the background. A full mega audit typically takes 2–5 minutes depending on the crawl size.</p>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Target</th><th className="px-4 py-2">Competitor</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Progress</th><th className="px-4 py-2">Created</th><th className="px-4 py-2 w-24">Actions</th></tr>
          </thead>
          <tbody>
            {((data ?? []) as Row[]).map((row) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-2 truncate max-w-xs">{row.target_url}</td>
                <td className="px-4 py-2 truncate max-w-xs text-muted-foreground">{row.competitor_url ?? "—"}</td>
                <td className="px-4 py-2"><Badge variant={row.status === "complete" ? "default" : row.status === "error" ? "destructive" : "secondary"}>{row.status}</Badge></td>
                <td className={`px-4 py-2 font-semibold ${scoreCls(row.overall_score)}`}>{row.overall_score ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{row.status === "running" || row.status === "pending" ? `${row.progress}% · ${row.status_message ?? ""}` : row.status_message ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <Button asChild size="sm" variant="ghost"><Link to="/mega-audit/$id" params={{ id: row.id }}><Eye className="h-3.5 w-3.5" /></Link></Button>
                    <Button size="sm" variant="ghost" onClick={() => mDel.mutate(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No mega audits yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
