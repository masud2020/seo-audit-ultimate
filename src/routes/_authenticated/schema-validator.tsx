import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Braces } from "lucide-react";
import { runSchemaValidator, type SchemaResult } from "@/lib/site-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { ToolReportExtras } from "@/components/reports/ToolReportExtras";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/schema-validator")({ component: Page });

function Page() {
  const run = useServerFn(runSchemaValidator);
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState<SchemaResult | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { url } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => { setLoaded(null); toast.success(`${r.blocks.length} structured data block(s)`); },
  });
  const v = mut.data ?? loaded;
  const runId = (mut.data as SchemaResult | undefined)?.run_id ?? loadedId;
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Braces className="h-6 w-6" />Schema Validator</h1>
        <p className="text-sm text-muted-foreground">Detect and validate JSON-LD, microdata, RDFa, OpenGraph and Twitter cards.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] items-end">
        <div><Label>URL</Label><Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!url || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning…</> : "Validate schema"}
        </Button>
      </Card>
      <RecentRuns<SchemaResult> tool="schema_validator" onLoad={({ id, input, result }) => {
        const i = input as { url?: string };
        if (i?.url) setUrl(i.url);
        setLoaded(result);
        setLoadedId(id);
      }} />
      {v && (
        <>
          {runId && <ToolReportExtras runId={runId} tool="schema_validator" label={`Schema · ${new URL(v.url).host}`} result={v} />}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm truncate">{v.url}</div>
              <Badge variant={v.score >= 80 ? "default" : v.score >= 50 ? "secondary" : "destructive"}>{v.score}/100</Badge>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(v.by_format).map(([k, n]) => <Badge key={k} variant="outline">{k}: {n}</Badge>)}
              {v.errors > 0 && <Badge variant="destructive">{v.errors} invalid</Badge>}
            </div>
          </Card>
          <Card className="p-0">
            <div className="p-3 border-b font-medium">Blocks ({v.blocks.length})</div>
            <ul className="divide-y">
              {v.blocks.length === 0 && <li className="p-3 text-sm text-muted-foreground">No structured data detected.</li>}
              {v.blocks.map((b, idx) => (
                <li key={idx} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{b.format}</Badge>
                    <span className="font-medium">{b.type}</span>
                    {b.valid ? <Badge className="bg-emerald-600 text-xs">valid</Badge> : <Badge variant="destructive" className="text-xs">invalid</Badge>}
                  </div>
                  {b.error && <div className="text-xs text-destructive mt-1">{b.error}</div>}
                  {b.raw !== undefined && (
                    <pre className="mt-2 text-[10px] bg-muted p-2 rounded max-h-40 overflow-auto">{JSON.stringify(b.raw, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {v.suggestions.length > 0 && (
            <Card className="p-4">
              <div className="font-medium mb-2">Suggestions</div>
              <ul className="list-disc pl-5 text-sm space-y-1">{v.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}