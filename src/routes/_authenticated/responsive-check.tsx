import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Smartphone } from "lucide-react";
import { runResponsiveCheck, type ResponsiveResult } from "@/lib/site-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/responsive-check")({ component: Page });

function Page() {
  const run = useServerFn(runResponsiveCheck);
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState<ResponsiveResult | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { url } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => { setLoaded(null); toast.success(`Responsive score ${r.score}/100`); },
  });
  const v = mut.data ?? loaded;
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Smartphone className="h-6 w-6" />Responsive Check</h1>
        <p className="text-sm text-muted-foreground">Viewport meta, media queries, responsive images and fluid units.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] items-end">
        <div><Label>URL</Label><Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!url || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</> : "Check responsive"}
        </Button>
      </Card>
      <RecentRuns<ResponsiveResult> tool="responsive_check" onLoad={({ input, result }) => {
        const i = input as { url?: string };
        if (i?.url) setUrl(i.url);
        setLoaded(result);
      }} />
      {v && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm truncate">{v.url}</div>
              <Badge variant={v.score >= 80 ? "default" : v.score >= 50 ? "secondary" : "destructive"}>{v.score}/100</Badge>
            </div>
            <div className="grid gap-2 text-sm">
              <div><span className="text-muted-foreground">Viewport meta:</span> {v.viewport_meta ? <code className="text-xs bg-muted px-1 rounded">{v.viewport_meta}</code> : <span className="text-destructive">missing</span>}</div>
              <div><span className="text-muted-foreground">device-width viewport:</span> {v.responsive_viewport ? "✅ yes" : "❌ no"}</div>
              <div><span className="text-muted-foreground">Media queries:</span> {v.media_queries}</div>
              <div><span className="text-muted-foreground">Responsive images:</span> {v.srcset_imgs} srcset · {v.picture_tags} &lt;picture&gt; of {v.total_imgs} total</div>
              <div><span className="text-muted-foreground">Fluid units share:</span> {v.flexible_units_pct}%</div>
              <div><span className="text-muted-foreground">Fixed-width elements:</span> {v.fixed_width_elements}</div>
            </div>
          </Card>
          {v.issues.length > 0 && (
            <Card className="p-4">
              <div className="font-medium mb-2">Issues</div>
              <ul className="list-disc pl-5 text-sm space-y-1">{v.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}