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
import { Loader2, Link2Off, Download, PlayCircle, Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [maxPages, setMaxPages] = useState(1);
  const [maxDepth, setMaxDepth] = useState(0);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [concurrency, setConcurrency] = useState(8);
  const [sameHostOnly, setSameHostOnly] = useState(true);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("broken");

  const runsQuery = useQuery({ queryKey: ["broken-link-runs"], queryFn: () => listRuns() });
  const itemsQuery = useQuery({ queryKey: ["broken-link-items", activeRun], queryFn: () => getItems({ data: { runId: activeRun! } }), enabled: !!activeRun });

  const startMut = useMutation({
    mutationFn: () => run({ data: { url, max_links: maxLinks, max_pages: maxPages, max_depth: maxDepth, timeout_ms: timeoutMs, concurrency, same_host_only: sameHostOnly } }),
    onSuccess: (r) => { setActiveRun(r.runId); toast.success(`Scanned ${r.pages} page(s) · ${r.total} links · ${r.broken} broken`); qc.invalidateQueries({ queryKey: ["broken-link-runs"] }); },
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
        <Collapsible open={tuneOpen} onOpenChange={setTuneOpen} className="mt-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5 mr-1" />{tuneOpen ? "Hide" : "Show"} advanced options
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 md:grid-cols-4 mt-3 pt-3 border-t border-border">
              <div>
                <Label className="text-xs">Max pages to crawl</Label>
                <Input type="number" min={1} max={50} value={maxPages} onChange={e => setMaxPages(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
                <p className="text-[10px] text-muted-foreground mt-1">Internal pages visited (BFS). 1 = only the given URL.</p>
              </div>
              <div>
                <Label className="text-xs">Crawl depth</Label>
                <Input type="number" min={0} max={5} value={maxDepth} onChange={e => setMaxDepth(Math.min(5, Math.max(0, Number(e.target.value) || 0)))} />
                <p className="text-[10px] text-muted-foreground mt-1">Link-follow depth from start URL. 0 = single page.</p>
              </div>
              <div>
                <Label className="text-xs">Request timeout (ms)</Label>
                <Input type="number" min={2000} max={30000} step={500} value={timeoutMs} onChange={e => setTimeoutMs(Math.min(30000, Math.max(2000, Number(e.target.value) || 10000)))} />
                <p className="text-[10px] text-muted-foreground mt-1">Per-link fetch timeout.</p>
              </div>
              <div>
                <Label className="text-xs">Concurrency</Label>
                <Input type="number" min={1} max={20} value={concurrency} onChange={e => setConcurrency(Math.min(20, Math.max(1, Number(e.target.value) || 8)))} />
                <p className="text-[10px] text-muted-foreground mt-1">Parallel HTTP requests. Higher = faster but heavier.</p>
              </div>
              <div className="md:col-span-4 flex items-center gap-2">
                <Switch id="same-host" checked={sameHostOnly} onCheckedChange={setSameHostOnly} />
                <Label htmlFor="same-host" className="text-xs cursor-pointer">Only follow same-host links when crawling deeper (external links are still checked)</Label>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
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