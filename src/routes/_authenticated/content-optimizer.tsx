import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { optimizeContent, listOptimizations } from "@/lib/phase3.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/content-optimizer")({ component: OptimizerPage });

interface Analysis {
  word_count: number; keyword_density: number; keyword_count: number;
  readability: { score: number; grade: string };
  suggestions: string[]; semantic_keywords: string[];
  headings_suggestion?: string; meta_title_suggestion?: string; meta_description_suggestion?: string;
}

function OptimizerPage() {
  const qc = useQueryClient();
  const opt = useServerFn(optimizeContent);
  const list = useServerFn(listOptimizations);
  const q = useQuery({ queryKey: ["optimizations"], queryFn: () => list() });
  const [kw, setKw] = useState(""); const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [current, setCurrent] = useState<Analysis | null>(null);
  const m = useMutation({
    mutationFn: () => opt({ data: { target_keyword: kw, title, content } }),
    onSuccess: (r) => { setCurrent(r.analysis as unknown as Analysis); qc.invalidateQueries({ queryKey: ["optimizations"] }); toast.success("Analysis complete"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Content Optimizer</h1>
        <p className="text-sm text-muted-foreground">Paste content + a target keyword. Get keyword density, readability, semantic terms and AI-driven suggestions.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-4 space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); if (kw && content) m.mutate(); }} className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Target keyword</label><Input value={kw} onChange={e => setKw(e.target.value)} placeholder="best running shoes" required /></div>
              <div><label className="text-xs text-muted-foreground">Page title (optional)</label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="10 Best Running Shoes of 2026" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Content</label><Textarea value={content} onChange={e => setContent(e.target.value)} rows={16} placeholder="Paste your article content here…" required /></div>
            <Button disabled={m.isPending || !kw || !content}>{m.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing…</> : <><Sparkles className="h-4 w-4 mr-2" />Analyse</>}</Button>
          </form>
        </Card>
        <div className="space-y-3">
          {current ? <AnalysisView a={current} /> : <Card className="p-6 text-sm text-muted-foreground">Run an analysis to see suggestions here.</Card>}
          {q.data && q.data.length > 0 && (
            <Card className="p-3">
              <div className="text-xs font-semibold mb-2">Recent</div>
              <ul className="space-y-1 text-xs">
                {q.data.slice(0, 10).map(o => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <button className="truncate text-left hover:underline" onClick={() => setCurrent(o.analysis as unknown as Analysis)}>{o.target_keyword}</button>
                    <span className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisView({ a }: { a: Analysis }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Words" value={a.word_count} />
        <Stat label="Keyword hits" value={a.keyword_count} />
        <Stat label="Density" value={`${a.keyword_density}%`} />
        <Stat label="Readability" value={`${a.readability.score} · ${a.readability.grade}`} />
      </div>
      {a.suggestions?.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1">Suggestions</div>
          <ul className="space-y-1 text-xs list-disc pl-4">{a.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {a.semantic_keywords?.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1">Semantic keywords</div>
          <div className="flex flex-wrap gap-1">{a.semantic_keywords.map(k => <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>)}</div>
        </div>
      )}
      {a.meta_title_suggestion && (
        <div><div className="text-xs font-semibold">Meta title</div><div className="text-xs text-muted-foreground">{a.meta_title_suggestion}</div></div>
      )}
      {a.meta_description_suggestion && (
        <div><div className="text-xs font-semibold">Meta description</div><div className="text-xs text-muted-foreground">{a.meta_description_suggestion}</div></div>
      )}
      {a.headings_suggestion && (
        <div><div className="text-xs font-semibold">Headings outline</div><pre className="text-xs text-muted-foreground whitespace-pre-wrap">{a.headings_suggestion}</pre></div>
      )}
    </Card>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="text-sm font-semibold">{value}</div></div>;
}