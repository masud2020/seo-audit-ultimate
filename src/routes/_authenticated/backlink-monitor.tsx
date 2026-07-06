import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMonitoredBacklinks, addBacklink, removeBacklink, recheckBacklinks, importFromSemrush } from "@/lib/backlink-monitor.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2, RefreshCw, Download, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/backlink-monitor")({ component: BacklinkMonitorPage });

type Row = { id: string; source_url: string; target_url: string; anchor: string | null; target_domain: string; last_status: string; last_seen_at: string; lost_at: string | null; source: string; first_seen_at: string };

function BacklinkMonitorPage() {
  const list = useServerFn(listMonitoredBacklinks);
  const add = useServerFn(addBacklink);
  const remove = useServerFn(removeBacklink);
  const recheck = useServerFn(recheckBacklinks);
  const importer = useServerFn(importFromSemrush);
  const qc = useQueryClient();

  const [src, setSrc] = useState(""); const [tgt, setTgt] = useState(""); const [anchor, setAnchor] = useState("");
  const [domain, setDomain] = useState("");

  const q = useQuery({ queryKey: ["backlinks"], queryFn: () => list() });
  const rows = (q.data ?? []) as Row[];
  const live = rows.filter(r => r.last_status === "live").length;
  const lost = rows.filter(r => r.last_status === "lost").length;
  const newWeek = rows.filter(r => Date.now() - Date.parse(r.first_seen_at) < 7 * 86400_000).length;

  const addMut = useMutation({
    mutationFn: () => add({ data: { source_url: src, target_url: tgt, anchor: anchor || undefined } }),
    onSuccess: () => { toast.success("Added"); setSrc(""); setTgt(""); setAnchor(""); qc.invalidateQueries({ queryKey: ["backlinks"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const recheckMut = useMutation({
    mutationFn: () => recheck(),
    onSuccess: (r) => { toast.success(`Checked ${r.checked} · ${r.live} live · ${r.lost} lost`); qc.invalidateQueries({ queryKey: ["backlinks"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const importMut = useMutation({
    mutationFn: () => importer({ data: { domain, limit: 50 } }),
    onSuccess: (r) => { toast.success(`Imported ${r.imported} of ${r.total}`); qc.invalidateQueries({ queryKey: ["backlinks"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const exportCsv = () => {
    const cols = ["target_domain", "source_url", "target_url", "anchor", "last_status", "last_seen_at", "lost_at", "source"];
    const csv = [cols.join(","), ...rows.map(r => cols.map(c => JSON.stringify((r as unknown as Record<string, unknown>)[c] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "backlinks.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6" />Backlink Monitoring</h1>
        <p className="text-sm text-muted-foreground">Track known backlinks over time. Flag live/lost/new. Import from Semrush or add manually.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Live</div><div className="text-3xl font-semibold text-emerald-500">{live}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Lost</div><div className="text-3xl font-semibold text-destructive">{lost}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">New this week</div><div className="text-3xl font-semibold">{newWeek}</div></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Add manually</div>
          <div className="space-y-2">
            <div><Label>Source URL</Label><Input placeholder="https://linking-site.com/article" value={src} onChange={e => setSrc(e.target.value)} /></div>
            <div><Label>Target URL (yours)</Label><Input placeholder="https://yoursite.com/page" value={tgt} onChange={e => setTgt(e.target.value)} /></div>
            <div><Label>Anchor (optional)</Label><Input placeholder="anchor text" value={anchor} onChange={e => setAnchor(e.target.value)} /></div>
            <Button size="sm" onClick={() => addMut.mutate()} disabled={!src || !tgt || addMut.isPending}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Import from Semrush</div>
          <div className="space-y-2">
            <div><Label>Your domain</Label><Input placeholder="yoursite.com" value={domain} onChange={e => setDomain(e.target.value)} /></div>
            <Button size="sm" onClick={() => importMut.mutate()} disabled={!domain || importMut.isPending}>
              {importMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</> : "Import top 50"}
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold">{rows.length} backlinks tracked</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => recheckMut.mutate()} disabled={recheckMut.isPending}>
              {recheckMut.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Checking…</> : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Check now</>}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          </div>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background">
              <tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Anchor</th><th className="px-3 py-2">Last seen</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="px-3 py-1.5"><Badge variant={r.last_status === "live" ? "secondary" : "destructive"} className="text-[10px]">{r.last_status}</Badge></td>
                  <td className="px-3 py-1.5 truncate max-w-xs" title={r.source_url}><a href={r.source_url} target="_blank" rel="noreferrer" className="hover:underline">{r.source_url}</a></td>
                  <td className="px-3 py-1.5 truncate max-w-xs" title={r.target_url}><a href={r.target_url} target="_blank" rel="noreferrer" className="hover:underline">{r.target_url}</a></td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[160px]">{r.anchor}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{new Date(r.last_seen_at).toLocaleDateString()}</td>
                  <td className="px-3 py-1.5"><Button size="sm" variant="ghost" onClick={() => remove({ data: { id: r.id } }).then(() => qc.invalidateQueries({ queryKey: ["backlinks"] }))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No backlinks yet. Add one or import from Semrush.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}