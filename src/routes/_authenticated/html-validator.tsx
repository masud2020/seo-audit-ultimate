import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, FileCode2 } from "lucide-react";
import { runHtmlValidator, type HtmlResult } from "@/lib/site-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { ToolReportExtras } from "@/components/reports/ToolReportExtras";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/html-validator")({ component: Page });

function Page() {
  const run = useServerFn(runHtmlValidator);
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState<HtmlResult | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { url } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => { setLoaded(null); toast.success(`${r.totals.errors} error(s), ${r.totals.warnings} warning(s)`); },
  });
  const v = mut.data ?? loaded;
  const runId = (mut.data as HtmlResult | undefined)?.run_id ?? loadedId;
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><FileCode2 className="h-6 w-6" />HTML Validator</h1>
        <p className="text-sm text-muted-foreground">Structural, accessibility and SEO checks on the page markup.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] items-end">
        <div><Label>URL</Label><Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!url || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Validating…</> : "Validate HTML"}
        </Button>
      </Card>
      <RecentRuns<HtmlResult> tool="html_validator" onLoad={({ id, input, result }) => {
        const i = input as { url?: string };
        if (i?.url) setUrl(i.url);
        setLoaded(result);
        setLoadedId(id);
      }} />
      {v && (
        <>
          {runId && <ToolReportExtras runId={runId} tool="html_validator" label={`HTML · ${new URL(v.url).host}`} result={v} />}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm truncate">{v.url}</div>
              <div className="flex gap-2">
                <Badge variant="destructive">{v.totals.errors} errors</Badge>
                <Badge variant="secondary">{v.totals.warnings} warnings</Badge>
                <Badge variant={v.score >= 80 ? "default" : "outline"}>{v.score}/100</Badge>
              </div>
            </div>
            <div className="grid gap-1 text-sm">
              <div><span className="text-muted-foreground">Doctype:</span> {v.doctype ?? "—"}</div>
              <div><span className="text-muted-foreground">Lang:</span> {v.lang ?? "—"}</div>
              <div><span className="text-muted-foreground">Charset:</span> {v.charset ?? "—"}</div>
              <div className="truncate"><span className="text-muted-foreground">Title:</span> {v.title ?? "—"}</div>
              <div className="truncate"><span className="text-muted-foreground">Meta description:</span> {v.meta_description ?? "—"}</div>
            </div>
          </Card>
          <Card className="p-0">
            <div className="p-3 border-b font-medium">Issues ({v.issues.length})</div>
            <ul className="divide-y">
              {v.issues.length === 0 && <li className="p-3 text-sm text-muted-foreground">No issues found.</li>}
              {v.issues.map((i, idx) => (
                <li key={idx} className="p-3 flex items-start gap-3 text-sm">
                  <Badge variant={i.severity === "error" ? "destructive" : i.severity === "warning" ? "secondary" : "outline"} className="shrink-0">{i.severity}</Badge>
                  <div className="flex-1"><div className="font-medium">{i.rule}</div><div className="text-muted-foreground">{i.message}</div></div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}