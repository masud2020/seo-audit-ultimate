import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Link as LinkIcon, CheckCircle2, XCircle } from "lucide-react";
import { runBacklinkChecker, type BacklinkRow } from "@/lib/site-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/backlink-checker")({ component: Page });

type Result = { target: string; rows: BacklinkRow[] };

function Page() {
  const run = useServerFn(runBacklinkChecker);
  const [target, setTarget] = useState("");
  const [sources, setSources] = useState("");
  const [loaded, setLoaded] = useState<Result | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { target, sources } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => { setLoaded(null); toast.success(`${r.rows.filter(x => x.found).length}/${r.rows.length} sources linking`); },
  });
  const view = mut.data ?? loaded;
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><LinkIcon className="h-6 w-6" />Backlink Checker</h1>
        <p className="text-sm text-muted-foreground">Verify which source URLs actually link to your target domain.</p>
      </div>
      <Card className="p-4 grid gap-3">
        <div><Label>Target URL / domain</Label><Input placeholder="https://example.com" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div><Label>Source URLs (one per line, up to 25)</Label>
          <Textarea rows={6} placeholder={"https://blog.a.com/post-1\nhttps://news.b.com/article"} value={sources} onChange={(e) => setSources(e.target.value)} />
        </div>
        <div><Button onClick={() => mut.mutate()} disabled={!target || !sources || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</> : "Check backlinks"}
        </Button></div>
      </Card>
      <RecentRuns<Result> tool="backlink_checker" onLoad={({ input, result }) => {
        const i = input as { target?: string; sources?: string };
        if (i?.target) setTarget(i.target);
        if (i?.sources) setSources(i.sources);
        setLoaded(result);
      }} />
      {view && (
        <div className="space-y-3">
          {view.rows.map((r, idx) => (
            <Card key={idx} className="p-3">
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="text-sm font-medium truncate">{r.source}</div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{r.status || "err"}</Badge>
                  {r.found ? <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Linked</Badge>
                    : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />No link</Badge>}
                </div>
              </div>
              {r.error && <div className="text-xs text-destructive">{r.error}</div>}
              {r.links.length > 0 && (
                <ul className="text-xs space-y-1 mt-1">
                  {r.links.map((l, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground truncate">→ {l.href}</span>
                      {l.anchor && <span className="italic">"{l.anchor}"</span>}
                      {l.nofollow && <Badge variant="outline" className="text-[10px]">nofollow</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}