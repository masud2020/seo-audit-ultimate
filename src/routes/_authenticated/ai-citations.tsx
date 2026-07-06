import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { runCitationCheck } from "@/lib/ai-citations.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Quote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-citations")({ component: AiCitationsPage });

function AiCitationsPage() {
  const run = useServerFn(runCitationCheck);
  const [domain, setDomain] = useState("");
  const [prompts, setPrompts] = useState("");
  const mut = useMutation({
    mutationFn: () => run({ data: { target_domain: domain, prompts: prompts.split(/\n+/).map(s => s.trim()).filter(Boolean) } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => toast.success(`${r.hits} of ${r.total} answers cited your domain`),
  });
  const d = mut.data;
  const promptList = prompts.split(/\n+/).map(s => s.trim()).filter(Boolean);

  const byPrompt: Record<string, typeof d extends { results: infer R } ? R : never> = {} as never;
  if (d) for (const p of promptList) byPrompt[p] = d.results.filter(r => r.prompt === p) as never;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Quote className="h-6 w-6" />AI Citation Checker</h1>
        <p className="text-sm text-muted-foreground">Ask multiple AI models your prompts and see which ones cite your domain in the answer.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div><Label>Your domain</Label><Input placeholder="yoursite.com" value={domain} onChange={e => setDomain(e.target.value)} /></div>
          <div>
            <Label>Prompts (one per line, up to 15)</Label>
            <Textarea rows={4} placeholder={"best seo audit tools\nhow to fix broken links\ntop rank tracker"} value={prompts} onChange={e => setPrompts(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={!domain || promptList.length === 0 || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Querying models…</> : "Run check"}
        </Button>
      </Card>

      {d && (
        <Card className="p-4">
          <div className="text-lg font-semibold mb-1">Coverage: {d.hits} / {d.total} <span className="text-sm font-normal text-muted-foreground">({Math.round((d.hits / d.total) * 100)}%)</span></div>
          <div className="space-y-4 mt-4">
            {promptList.map((p) => (
              <div key={p} className="border border-border rounded p-3">
                <div className="text-sm font-medium mb-2">{p}</div>
                <div className="grid gap-2 md:grid-cols-3">
                  {(byPrompt[p] as unknown as Array<{ model: string; cited: boolean; mentions: number; snippet: string | null; error?: string }>).map((r, i) => (
                    <div key={i} className="border border-border/60 rounded p-2 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] truncate">{r.model}</span>
                        <Badge variant={r.cited ? "secondary" : "outline"} className="text-[10px]">{r.cited ? `cited ×${r.mentions}` : "no mention"}</Badge>
                      </div>
                      {r.error && <div className="text-destructive text-[11px]">{r.error}</div>}
                      {r.snippet && <div className="text-[11px] text-muted-foreground italic">{r.snippet}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}