import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { detectAiContent } from "@/lib/ai-detection.functions";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-detection")({ component: AiDetectionPage });

function AiDetectionPage() {
  const detect = useServerFn(detectAiContent);
  const [text, setText] = useState("");
  const mut = useMutation({
    mutationFn: () => detect({ data: { text } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const d = mut.data;
  const verdictColor = d ? (d.verdict === "human" ? "text-emerald-500" : d.verdict === "mixed" ? "text-amber-500" : "text-destructive") : "";
  const pct = d ? Math.round(d.ai_probability * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Bot className="h-6 w-6" />AI Content Detection</h1>
        <p className="text-sm text-muted-foreground">Estimate whether text was written by an AI model. Uses Lovable AI heuristics — no third-party detector required.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-4">
          <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste at least 50 characters of text…" className="min-h-[400px]" />
          <div className="mt-2 flex items-center gap-2">
            <div className="text-xs text-muted-foreground">{text.length} chars</div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setText("")}>Clear</Button>
            <Button size="sm" onClick={() => mut.mutate()} disabled={text.length < 50 || mut.isPending}>
              {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</> : "Detect"}
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          {!d && <div className="text-sm text-muted-foreground">Run a detection to see the score.</div>}
          {d && (
            <>
              <div className="text-center">
                <div className={`text-6xl font-bold ${verdictColor}`}>{pct}%</div>
                <div className="text-xs uppercase text-muted-foreground mt-1">Likely AI</div>
                <Badge variant="outline" className="mt-2">{d.verdict.replace("_", " ")} · {d.confidence} confidence</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{d.summary}</p>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Signals</div>
                {d.signals.map((s, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-0.5"><span>{s.name}</span><span className="text-muted-foreground">{Math.round(s.score * 100)}%</span></div>
                    <div className="h-1.5 bg-muted rounded"><div className="h-full bg-primary rounded" style={{ width: `${s.score * 100}%` }} /></div>
                    {s.note && <div className="text-[11px] text-muted-foreground mt-0.5">{s.note}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}