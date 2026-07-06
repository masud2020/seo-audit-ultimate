import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listToolRuns, getToolRun, deleteToolRun, toolRunStats } from "@/lib/tool-runs.functions";
import { exportToolRunCsv, exportToolRunPdf } from "@/lib/tool-run-export.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Download, FileText, Trash2, Eye, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tool-history")({ component: ToolHistoryPage });

type Run = {
  id: string; tool: string; status: string; label: string | null;
  input: Record<string, unknown>; result: Record<string, unknown>;
  error: string | null; ref_table: string | null; ref_id: string | null;
  duration_ms: number | null; created_at: string; finished_at: string | null;
};

const TOOL_META: Record<string, { label: string; color: string }> = {
  broken_links: { label: "Broken Links", color: "bg-red-500/10 text-red-700 dark:text-red-300" },
  backlink_monitor: { label: "Backlink Monitor", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  ai_detection: { label: "AI Detection", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
  ai_citations: { label: "AI Citations", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  ai_potential: { label: "AI Potential", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  seo_news: { label: "SEO News", color: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
};

const EXPORTABLE = new Set(["broken_links", "backlink_monitor", "ai_detection", "ai_citations", "ai_potential"]);

function statusBadge(s: string) {
  if (s === "success") return <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">success</Badge>;
  if (s === "error") return <Badge variant="destructive">error</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function ToolHistoryPage() {
  const list = useServerFn(listToolRuns);
  const stats = useServerFn(toolRunStats);
  const getRun = useServerFn(getToolRun);
  const del = useServerFn(deleteToolRun);
  const csvExport = useServerFn(exportToolRunCsv);
  const pdfExport = useServerFn(exportToolRunPdf);
  const qc = useQueryClient();

  const [tool, setTool] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Run | null>(null);

  const runsQuery = useQuery({
    queryKey: ["tool-runs", tool, status, from, to, q],
    queryFn: () => list({ data: { tool, status, from: from || undefined, to: to || undefined, q: q || undefined, limit: 200 } }),
  });
  const statsQuery = useQuery({ queryKey: ["tool-runs-stats"], queryFn: () => stats() });

  const runs = (runsQuery.data ?? []) as Run[];
  const totalCounts = useMemo(() => {
    const d = statsQuery.data ?? {};
    let total = 0, ok = 0, err = 0;
    for (const k of Object.keys(d)) { const v = (d as Record<string, { total: number; success: number; error: number }>)[k]; total += v.total; ok += v.success; err += v.error; }
    return { total, ok, err };
  }, [statsQuery.data]);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tool-runs"] }); qc.invalidateQueries({ queryKey: ["tool-runs-stats"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const doCsv = async (id: string) => {
    try {
      const r = await csvExport({ data: { id } });
      const blob = new Blob([r.csv], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = r.filename; a.click();
    } catch (e) { toast.error(e instanceof Error ? e.message : "CSV export failed"); }
  };
  const doPdf = async (id: string) => {
    try {
      const r = await pdfExport({ data: { id } });
      const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = r.filename; a.click();
    } catch (e) { toast.error(e instanceof Error ? e.message : "PDF export failed"); }
  };

  const openRun = async (id: string) => {
    try { const r = await getRun({ data: { id } }); setOpen(r as Run); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Load failed"); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><History className="h-6 w-6" />Run History</h1>
        <p className="text-sm text-muted-foreground">Every run across your six tools, with filters, status tracking, and CSV/PDF export.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total runs</div><div className="text-2xl font-semibold">{totalCounts.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Successful</div><div className="text-2xl font-semibold text-emerald-600">{totalCounts.ok}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Errored</div><div className="text-2xl font-semibold text-red-600">{totalCounts.err}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Tools tracked</div><div className="text-2xl font-semibold">{Object.keys(TOOL_META).length}</div></Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_140px_160px_160px_auto] items-end">
          <div>
            <Label className="text-xs">Search label</Label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-7" placeholder="URL, domain, keyword…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tool</Label>
            <Select value={tool} onValueChange={setTool}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tools</SelectItem>
                {Object.entries(TOOL_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={() => { setTool("all"); setStatus("all"); setFrom(""); setTo(""); setQ(""); }}>Reset</Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-auto max-h-[640px]">
          <table className="w-full text-xs">
            <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background">
              <tr>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const meta = TOOL_META[r.tool] ?? { label: r.tool, color: "" };
                return (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${meta.color}`}>{meta.label}</span></td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2 truncate max-w-md" title={r.label ?? ""}>{r.label ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.duration_ms ? `${r.duration_ms} ms` : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openRun(r.id)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                        {EXPORTABLE.has(r.tool) && r.status === "success" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => doCsv(r.id)} title="CSV"><Download className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => doPdf(r.id)} title="PDF"><FileText className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this run?")) delMut.mutate(r.id); }} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {runs.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">{runsQuery.isLoading ? "Loading…" : "No runs match these filters."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {open && <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${TOOL_META[open.tool]?.color ?? ""}`}>{TOOL_META[open.tool]?.label ?? open.tool}</span>}
              {open?.label ?? "Run details"}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                {statusBadge(open.status)}
                <span className="text-xs text-muted-foreground">{new Date(open.created_at).toLocaleString()}</span>
                {open.duration_ms != null && <span className="text-xs text-muted-foreground">· {open.duration_ms} ms</span>}
                <div className="flex-1" />
                {EXPORTABLE.has(open.tool) && open.status === "success" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => doCsv(open.id)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
                    <Button size="sm" variant="outline" onClick={() => doPdf(open.id)}><FileText className="h-3.5 w-3.5 mr-1" />PDF</Button>
                  </>
                )}
              </div>
              {open.error && <div className="rounded border border-red-500/40 bg-red-500/5 p-2 text-red-700 dark:text-red-300 text-xs whitespace-pre-wrap">{open.error}</div>}
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Input</div>
                <pre className="rounded bg-muted p-2 text-[11px] overflow-auto max-h-40">{JSON.stringify(open.input, null, 2)}</pre>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Result</div>
                <pre className="rounded bg-muted p-2 text-[11px] overflow-auto max-h-96">{JSON.stringify(open.result, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
