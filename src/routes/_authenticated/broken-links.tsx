import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runBrokenLinkCheck, listBrokenLinkChecks, getBrokenLinkItems } from "@/lib/broken-links.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Link2Off, Download, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/broken-links")({ component: BrokenLinksPage });

type Item = { id: string; source_url: string; target_url: string; status_code: number | null; status_bucket: string; is_external: boolean; error: string | null };
type Run = { id: string; root_url: string; status: string; links_total: number; links_broken: number; created_at: string };

const bucketVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "2xx": "secondary", "3xx": "outline", "4xx": "destructive", "5xx": "destructive", "timeout": "destructive", "network-error": "destructive",
};

function BrokenLinksPage() {
  const run = useServerFn(runBrokenLinkCheck);
  const listRuns = useServerFn(listBrokenLinkChecks);
  const getItems = useServerFn(getBrokenLinkItems);
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [maxLinks, setMaxLinks] = useState(150);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("broken");

  const runsQuery = useQuery({ queryKey: ["broken-link-runs"], queryFn: () => listRuns() });
  const itemsQuery = useQuery({ queryKey: ["broken-link-items", activeRun], queryFn: () => getItems({ data: { runId: activeRun! } }), enabled: !!activeRun });

  const startMut = useMutation({
    mutationFn: () => run({ data: { url, max_links: maxLinks } }),
    onSuccess: (r) => { setActiveRun(r.runId); toast.success(`Checked ${r.total} links · ${r.broken} broken`); qc.invalidateQueries({ queryKey: ["broken-link-runs"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const items = (itemsQuery.data ?? []) as Item[];
  const filtered = items.filter(i => {
    if (filter === "all") return true;
    if (filter === "broken") return ["4xx", "5xx", "timeout", "network-error"].includes(i.status_bucket);
    return i.status_bucket === filter;
  });

  const exportCsv = () => {
    const cols = ["target_url", "status_code", "status_bucket", "is_external", "error"];
    const rows = [cols.join(","), ...filtered.map(i => cols.map(c => JSON.stringify((i as unknown as Record<string, unknown>)[c] ?? "")).join(","))];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "broken-links.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Link2Off className="h-6 w-6" />Broken Link Checker</h1>
        <p className="text-sm text-muted-foreground">Scan a page and check every internal + external link for 4xx / 5xx / timeouts.</p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto] items-end">
          <div><Label>URL to scan</Label><Input placeholder="https://example.com/page" value={url} onChange={e => setUrl(e.target.value)} /></div>
          <div><Label>Max links</Label><Input type="number" min={10} max={500} value={maxLinks} onChange={e => setMaxLinks(Number(e.target.value) || 150)} /></div>
          <Button onClick={() => startMut.mutate()} disabled={!url || startMut.isPending}>
            {startMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning…</> : <><PlayCircle className="h-4 w-4 mr-2" />Scan</>}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recent runs</div>
          <div className="space-y-1">
            {((runsQuery.data ?? []) as Run[]).map(r => (
              <button key={r.id} onClick={() => setActiveRun(r.id)} className={`w-full text-left rounded p-2 text-xs hover:bg-muted ${activeRun === r.id ? "bg-muted" : ""}`}>
                <div className="truncate font-medium">{r.root_url}</div>
                <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                  <Badge variant={r.links_broken > 0 ? "destructive" : "secondary"} className="h-4 px-1 text-[10px]">{r.links_broken} broken</Badge>
                  <span>{r.links_total} total</span>
                </div>
              </button>
            ))}
            {(!runsQuery.data || (runsQuery.data as Run[]).length === 0) && <div className="text-xs text-muted-foreground p-2">No runs yet.</div>}
          </div>
        </Card>

        <Card>
          <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
            {["all", "broken", "2xx", "3xx", "4xx", "5xx", "timeout"].map(k => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{k}</Button>
            ))}
            <div className="flex-1" />
            {items.length > 0 && <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
          </div>
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background">
                <tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Target URL</th><th className="px-3 py-2">Type</th></tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-3 py-1.5"><Badge variant={bucketVariant[i.status_bucket] ?? "outline"} className="text-[10px]">{i.status_bucket}</Badge></td>
                    <td className="px-3 py-1.5">{i.status_code ?? "—"}</td>
                    <td className="px-3 py-1.5 truncate max-w-md" title={i.target_url}><a href={i.target_url} target="_blank" rel="noreferrer" className="hover:underline">{i.target_url}</a></td>
                    <td className="px-3 py-1.5">{i.is_external ? "external" : "internal"}</td>
                  </tr>
                ))}
                {activeRun && filtered.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nothing here for this filter.</td></tr>}
                {!activeRun && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Run a scan or pick a previous run.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}