import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { scoreCitationPotential } from "@/lib/ai-potential.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-potential")({ component: AiPotentialPage });

function AiPotentialPage() {
  const score = useServerFn(scoreCitationPotential);
  const [url, setUrl] = useState("");
  const mut = useMutation({
    mutationFn: () => score({ data: { url } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const d = mut.data;
  const bandColor = d ? (d.overall_score >= 75 ? "text-emerald-500" : d.overall_score >= 50 ? "text-amber-500" : "text-destructive") : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Sparkles className="h-6 w-6" />AI Citation Potential</h1>
        <p className="text-sm text-muted-foreground">Score how likely an AI assistant is to cite this URL, and get actionable rewrite recommendations.</p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <div><Label>Page URL</Label><Input placeholder="https://yoursite.com/article" value={url} onChange={e => setUrl(e.target.value)} /></div>
          <Button onClick={() => mut.mutate()} disabled={!url || mut.isPending}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</> : "Analyze"}
          </Button>
        </div>
      </Card>

      {d && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="p-6 text-center">
            <div className={`text-6xl font-bold ${bandColor}`}>{d.overall_score}</div>
            <div className="text-xs uppercase text-muted-foreground mt-1">Overall</div>
            <Badge variant="outline" className="mt-3">{d.verdict}</Badge>
            <div className="text-xs text-muted-foreground mt-4 truncate" title={d.title}>{d.title}</div>
          </Card>
          <div className="space-y-4">
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Criteria</div>
              <div className="grid gap-2 md:grid-cols-2">
                {d.criteria.map(c => (
                  <div key={c.id} className="border border-border rounded p-2">
                    <div className="flex justify-between text-xs mb-1"><span className="font-medium">{c.label}</span><span className={c.score >= 75 ? "text-emerald-500" : c.score >= 50 ? "text-amber-500" : "text-destructive"}>{c.score}</span></div>
                    <div className="h-1.5 bg-muted rounded"><div className="h-full bg-primary rounded" style={{ width: `${c.score}%` }} /></div>
                    <div className="text-[11px] text-muted-foreground mt-1">{c.note}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">Recommendations</div>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(d.recommendations.join("\n")); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
              </div>
              <ul className="space-y-1.5 text-xs list-disc pl-4">
                {d.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Card>
            {d.quotable_snippets?.length > 0 && (
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Quotable snippets on this page</div>
                <ul className="space-y-1.5 text-xs">
                  {d.quotable_snippets.map((s, i) => <li key={i} className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground">{s}</li>)}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}