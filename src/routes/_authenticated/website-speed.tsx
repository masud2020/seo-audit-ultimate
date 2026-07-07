import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { runWebsiteSpeed, type SpeedResult } from "@/lib/site-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { ToolReportExtras } from "@/components/reports/ToolReportExtras";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/website-speed")({ component: Page });

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}

function Page() {
  const run = useServerFn(runWebsiteSpeed);
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState<SpeedResult | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { url } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => { setLoaded(null); toast.success(`Speed score ${r.score}/100`); },
  });
  const v = mut.data ?? loaded;
  const runId = (mut.data as SpeedResult | undefined)?.run_id ?? loadedId;
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Zap className="h-6 w-6" />Website Speed</h1>
        <p className="text-sm text-muted-foreground">Server-side timing, page weight, resource counts, and compression checks.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] items-end">
        <div><Label>URL</Label><Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!url || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing…</> : "Test speed"}
        </Button>
      </Card>
      <RecentRuns<SpeedResult> tool="website_speed" onLoad={({ id, input, result }) => {
        const i = input as { url?: string };
        if (i?.url) setUrl(i.url);
        setLoaded(result);
        setLoadedId(id);
      }} />
      {v && (
        <>
          {runId && <ToolReportExtras runId={runId} tool="website_speed" label={`Speed · ${new URL(v.url).host}`} result={v} />}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm truncate">{v.url}</div>
              <Badge variant={v.score >= 80 ? "default" : v.score >= 50 ? "secondary" : "destructive"}>{v.score}/100</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="TTFB" value={`${v.ttfb_ms} ms`} />
              <Stat label="Total time" value={`${v.total_ms} ms`} />
              <Stat label="Page size" value={`${v.kb} KB`} />
              <Stat label="Status" value={v.status} />
              <Stat label="Scripts" value={v.resources.scripts} />
              <Stat label="Styles" value={v.resources.styles} />
              <Stat label="Images" value={v.resources.images} />
              <Stat label="Iframes" value={v.resources.iframes} />
              <Stat label="Compression" value={v.gzip ? "Enabled" : "None"} />
              <Stat label="CDN" value={v.cdn ?? "—"} />
              <Stat label="Server" value={v.server} />
              <Stat label="Cache-Control" value={v.cache_control || "—"} />
            </div>
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