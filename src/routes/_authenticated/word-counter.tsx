import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/word-counter")({ component: WordCounter });

function fleschKincaid(text: string) {
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const syllables = words.reduce((n, w) => n + syllableCount(w), 0);
  const asl = wordCount / sentences;
  const asw = syllables / Math.max(wordCount, 1);
  const ease = 206.835 - 1.015 * asl - 84.6 * asw;
  const grade = 0.39 * asl + 11.8 * asw - 15.59;
  return { ease: +ease.toFixed(1), grade: +grade.toFixed(1), asl: +asl.toFixed(1), asw: +asw.toFixed(2) };
}
function syllableCount(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  const m = word.match(/[aeiouy]+/g);
  let n = m ? m.length : 1;
  if (word.endsWith("e")) n = Math.max(1, n - 1);
  return n;
}

function WordCounter() {
  const [text, setText] = useState("");
  const stats = useMemo(() => {
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const wc = words.length;
    const sentences = (text.match(/[.!?]+/g) || []).length;
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim()).length;
    const reading = Math.max(1, Math.round(wc / 225));
    const fk = fleschKincaid(text);
    const freq: Record<string, number> = {};
    for (const w of words) { const k = w.toLowerCase().replace(/[^a-z0-9]/g, ""); if (k && k.length > 3) freq[k] = (freq[k] || 0) + 1; }
    const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10);
    return { chars, wc, sentences, paragraphs, reading, fk, top };
  }, [text]);

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Word Counter</h1><p className="text-sm text-muted-foreground">Paste content for live stats, readability, and keyword density.</p></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your content here…" className="min-h-[400px]" />
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setText("")}>Clear</Button>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}>Copy</Button>
          </div>
        </Card>
        <Card className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {[["Words",stats.wc],["Characters",stats.chars],["Sentences",stats.sentences],["Paragraphs",stats.paragraphs],["Reading min",stats.reading]].map(([k,v])=>(
              <div key={k as string} className="rounded border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">{k}</div><div className="text-lg font-semibold">{v as number}</div></div>
            ))}
          </div>
          <div className="rounded border border-border p-3">
            <div className="text-xs font-semibold mb-1">Flesch–Kincaid</div>
            <div className="text-xs text-muted-foreground">Reading ease: <span className="font-semibold text-foreground">{stats.fk.ease}</span> · Grade: <span className="font-semibold text-foreground">{stats.fk.grade}</span></div>
          </div>
          <div className="rounded border border-border p-3">
            <div className="text-xs font-semibold mb-2">Top keywords</div>
            {stats.top.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : (
              <ul className="space-y-1">
                {stats.top.map(([t, c]) => <li key={t} className="flex justify-between text-xs"><span>{t}</span><span className="text-muted-foreground">{c}</span></li>)}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}