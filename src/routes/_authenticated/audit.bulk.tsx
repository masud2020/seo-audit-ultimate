import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { startAudit } from "@/lib/audit.functions";
import { discoverSiteUrls } from "@/lib/misc.functions";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, PlayCircle, Upload, CheckCircle2, XCircle, FileText, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit/bulk")({ component: BulkAudit });

type RowStatus = "pending" | "running" | "done" | "error";
type Row = { url: string; status: RowStatus; auditId?: string; error?: string };

function normalizeUrl(raw: string): string | null {
  const s = raw.trim().replace(/^[,;"'\s]+|[,;"'\s]+$/g, "");
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try { new URL(withProto); return withProto; } catch { return null; }
}

function parseUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/[\s,;\n\r\t]+/)) {
    const u = normalizeUrl(line);
    if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

function BulkAudit() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteLimit, setSiteLimit] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const fn = useServerFn(startAudit);
  const discoverFn = useServerFn(discoverSiteUrls);

  const discover = useMutation({
    mutationFn: (v: { url: string; limit: number }) => discoverFn({ data: v }),
    onSuccess: (r) => {
      if (!r.urls.length) { toast.error("No URLs found on that site"); return; }
      setText((prev) => (prev ? prev + "\n" : "") + r.urls.join("\n"));
      toast.success(`Found ${r.count} URL${r.count === 1 ? "" : "s"} via ${r.source}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Discover failed"),
  });

  const parsed = parseUrls(text);

  async function onFile(f: File) {
    if (f.size > 2_000_000) { toast.error("File too large (max 2 MB)"); return; }
    const content = await f.text();
    setText((prev) => (prev ? prev + "\n" : "") + content);
  }

  async function run() {
    const urls = parseUrls(text);
    if (!urls.length) { toast.error("Add at least one valid URL"); return; }
    if (urls.length > 50) { toast.error("Max 50 URLs per bulk run"); return; }
    setRunning(true);
    const initial: Row[] = urls.map((u) => ({ url: u, status: "pending" }));
    setRows(initial);
    let done = 0;
    for (let i = 0; i < urls.length; i++) {
      setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "running" } : row)));
      try {
        const res = await fn({ data: { url: urls[i] } });
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "done", auditId: res.id } : row)));
      } catch (e) {
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "error", error: e instanceof Error ? e.message : "Failed" } : row)));
      }
      done++;
      setProgress(Math.round((done / urls.length) * 100));
    }
    setRunning(false);
    toast.success(`Bulk audit complete: ${done} URL${done === 1 ? "" : "s"}`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Audit</h1>
          <p className="text-sm text-muted-foreground">Paste or upload a list of URLs to audit them all in sequence.</p>
        </div>
        <Button variant="outline" asChild><Link to="/audit/new">Single audit</Link></Button>
      </div>

      <Card className="p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Discover URLs from a whole website (reads sitemap.xml / robots.txt)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="https://example.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} disabled={running || discover.isPending} className="flex-1" />
            <Input type="number" min={1} max={500} value={siteLimit} onChange={(e) => setSiteLimit(Math.max(1, Math.min(500, Number(e.target.value) || 50)))} disabled={running || discover.isPending} className="sm:w-24" />
            <Button type="button" variant="secondary" onClick={() => siteUrl && discover.mutate({ url: siteUrl, limit: siteLimit })} disabled={running || discover.isPending || !siteUrl}>
              {discover.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Discovering…</> : <><Globe className="h-4 w-4 mr-2" />Discover</>}
            </Button>
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs text-muted-foreground">URLs — one per line, or comma / space separated (max 50)</label>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={running}>
              <Upload className="h-4 w-4 mr-2" />Upload .txt / .csv
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setText(""); setRows([]); setProgress(0); }} disabled={running}>Clear</Button>
          </div>
        </div>
        <Textarea
          rows={10}
          placeholder={"https://example.com\nhttps://example.com/pricing\nblog.example.com"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={running}
          className="font-mono text-sm"
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />{parsed.length} valid URL{parsed.length === 1 ? "" : "s"} detected
          </div>
          <Button onClick={run} disabled={running || !parsed.length}>
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running {progress}%</> : <><PlayCircle className="h-4 w-4 mr-2" />Run {parsed.length || ""} audit{parsed.length === 1 ? "" : "s"}</>}
          </Button>
        </div>
        {running && <Progress value={progress} className="h-1" />}
      </Card>

      {rows.length > 0 && (
        <Card className="p-6">
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm border-b last:border-b-0 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  {r.status === "pending" && <div className="h-4 w-4 rounded-full border border-muted-foreground/40 shrink-0" />}
                  {r.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  {r.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {r.status === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  <span className="truncate">{r.url}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.error && <span className="text-xs text-destructive truncate max-w-[240px]">{r.error}</span>}
                  {r.auditId && (
                    <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/audit/$id", params: { id: r.auditId! } })}>View</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}