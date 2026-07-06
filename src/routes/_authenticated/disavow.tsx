import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scanBacklinks, listDisavow, addDisavow, removeDisavow, exportDisavow } from "@/lib/disavow.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, ShieldAlert, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/disavow")({ component: DisavowPage });

type ScanRow = { source_url: string; source_domain: string; anchor: string; external_num: number; domain_ascore: number; page_ascore: number; nofollow: boolean; toxicity_score: number; bucket: "toxic" | "suspicious" | "healthy"; reasons: string[] };

function DisavowPage() {
  const scan = useServerFn(scanBacklinks);
  const list = useServerFn(listDisavow);
  const add = useServerFn(addDisavow);
  const del = useServerFn(removeDisavow);
  const exp = useServerFn(exportDisavow);
  const qc = useQueryClient();

  const [domain, setDomain] = useState("");
  const [scanned, setScanned] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [scope, setScope] = useState<"domain" | "url">("domain");

  const mScan = useMutation({ mutationFn: () => scan({ data: { domain, limit: 300 } }), onSuccess: (d) => { setScanned(d.target); setSelected({}); }, onError: e => toast.error(e instanceof Error ? e.message : "Scan failed") });
  const { data: saved } = useQuery({ queryKey: ["disavow", scanned], queryFn: () => list({ data: { target_domain: scanned! } }), enabled: !!scanned });
  const mAdd = useMutation({ mutationFn: (rows: ScanRow[]) => add({ data: { target_domain: scanned!, entries: rows.map(r => ({ source_domain: r.source_domain, source_url: r.source_url, scope, reason: r.reasons.join("; ").slice(0, 400), toxicity_score: r.toxicity_score })) } }), onSuccess: (d) => { toast.success(`${d.added} added to disavow list`); setSelected({}); qc.invalidateQueries({ queryKey: ["disavow", scanned] }); }, onError: e => toast.error(e instanceof Error ? e.message : "Failed") });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["disavow", scanned] }) });
  const mExp = useMutation({ mutationFn: () => exp({ data: { target_domain: scanned! } }), onSuccess: (d) => {
    const blob = new Blob([d.text], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `disavow-${scanned}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success(`Exported ${d.count} entries`);
  }});

  const rows = (mScan.data?.rows as ScanRow[] | undefined) ?? [];
  const summary = mScan.data?.summary;
  const savedSet = new Set((saved ?? []).map(s => s.source_domain + "|" + (s.source_url ?? "")));

  const selectedRows = rows.filter((_, i) => selected[i]);
  const bulkSelect = (bucket: "toxic" | "suspicious") => {
    const next: Record<string, boolean> = { ...selected };
    rows.forEach((r, i) => { if (r.bucket === bucket) next[i] = true; });
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ShieldAlert className="h-6 w-6" />Toxic Backlinks & Disavow</h1>
        <p className="text-sm text-muted-foreground">Scan your backlink profile for toxic links, then export a Google-format disavow.txt. Uses your Semrush API key.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]"><Label>Your domain</Label><Input placeholder="yoursite.com" value={domain} onChange={e => setDomain(e.target.value)} /></div>
          <Button onClick={() => mScan.mutate()} disabled={domain.length < 3 || mScan.isPending}>{mScan.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning…</> : "Scan backlinks"}</Button>
        </div>
      </Card>

      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-semibold">{summary.total}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Toxic</div><div className="text-2xl font-semibold text-rose-400">{summary.toxic}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Suspicious</div><div className="text-2xl font-semibold text-amber-400">{summary.suspicious}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Healthy</div><div className="text-2xl font-semibold text-emerald-400">{summary.healthy}</div></Card>
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkSelect("toxic")}>Select all toxic</Button>
            <Button size="sm" variant="outline" onClick={() => bulkSelect("suspicious")}>Select all suspicious</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected({})}>Clear</Button>
            <div className="mx-2 h-6 w-px bg-border" />
            <label className="flex items-center gap-1 text-xs"><input type="radio" name="scope" checked={scope === "domain"} onChange={() => setScope("domain")} />Disavow whole domain</label>
            <label className="flex items-center gap-1 text-xs"><input type="radio" name="scope" checked={scope === "url"} onChange={() => setScope("url")} />Disavow only these URLs</label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" disabled={!selectedRows.length || mAdd.isPending} onClick={() => mAdd.mutate(selectedRows)}>Add {selectedRows.length ? `${selectedRows.length} ` : ""}to disavow list</Button>
            </div>
          </div>
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background">
                <tr><th className="px-3 py-2 w-8"></th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Anchor</th><th className="px-3 py-2">DA</th><th className="px-3 py-2">Ext</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Bucket</th><th className="px-3 py-2">Reasons</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const already = savedSet.has(r.source_domain + "|") || savedSet.has(r.source_domain + "|" + r.source_url);
                  return (
                    <tr key={i} className={`border-b border-border/40 hover:bg-muted/30 ${already ? "opacity-40" : ""}`}>
                      <td className="px-3 py-1.5"><Checkbox checked={!!selected[i]} onCheckedChange={(v) => setSelected(s => ({ ...s, [i]: !!v }))} disabled={already} /></td>
                      <td className="px-3 py-1.5"><div className="font-medium">{r.source_domain}</div><div className="text-muted-foreground truncate max-w-xs" title={r.source_url}>{r.source_url}</div></td>
                      <td className="px-3 py-1.5 truncate max-w-[200px]" title={r.anchor}>{r.anchor || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-1.5">{r.domain_ascore}</td>
                      <td className="px-3 py-1.5">{r.external_num}</td>
                      <td className="px-3 py-1.5 font-semibold">{r.toxicity_score}</td>
                      <td className="px-3 py-1.5"><Badge variant={r.bucket === "toxic" ? "destructive" : r.bucket === "suspicious" ? "secondary" : "outline"}>{r.bucket}</Badge></td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.reasons.join(", ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {scanned && (
        <Card>
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold">Disavow list for {scanned} <span className="text-xs text-muted-foreground ml-2">({(saved ?? []).length} entries)</span></div>
            <Button size="sm" onClick={() => mExp.mutate()} disabled={!(saved ?? []).length}><Download className="h-4 w-4 mr-1" />Export disavow.txt</Button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background"><tr><th className="px-3 py-2">Source</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Added</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {(saved ?? []).map(s => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="px-3 py-1.5"><div className="font-medium">{s.source_domain}</div>{s.source_url && <div className="text-muted-foreground truncate max-w-xs" title={s.source_url}>{s.source_url}</div>}</td>
                    <td className="px-3 py-1.5">{s.scope}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-md">{s.reason}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-1.5"><Button size="sm" variant="ghost" onClick={() => mDel.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
                {!(saved ?? []).length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No entries yet. Select rows above and add them.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}