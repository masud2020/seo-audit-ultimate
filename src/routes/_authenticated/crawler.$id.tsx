import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCrawl } from "@/lib/misc.functions";
import { generateCrawlPdf } from "@/lib/pdf.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Download, FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/crawler/$id")({ component: CrawlDetail });

interface Page { url: string; status: number; title: string; description: string; h1_count: number; word_count: number; bytes: number; duration_ms: number; canonical: string; noindex: boolean; images_missing_alt: number; internal_links: number; external_links: number; }
interface Issue { url: string; severity: "high" | "medium" | "low"; message: string; }

function CrawlDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getCrawl);
  const pdfFn = useServerFn(generateCrawlPdf);
  const { data } = useQuery({ queryKey: ["crawl", id], queryFn: () => fn({ data: { id } }) });
  const [q, setQ] = useState("");
  const mPdf = useMutation({
    mutationFn: () => pdfFn({ data: { crawl_id: id } }),
    onSuccess: (d) => {
      const bytes = Uint8Array.from(atob(d.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = d.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "PDF failed"),
  });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const pages = (data.pages as unknown as Page[]) ?? [];
  const issues = (data.issues as unknown as Issue[]) ?? [];
  const filtered = pages.filter(p => p.url.toLowerCase().includes(q.toLowerCase()) || p.title.toLowerCase().includes(q.toLowerCase()));
  const bySev = { high: issues.filter(i => i.severity === "high"), medium: issues.filter(i => i.severity === "medium"), low: issues.filter(i => i.severity === "low") };

  const aggregate = useMemo(() => {
    const n = pages.length || 1;
    const avg = (fn: (p: Page) => number) => Math.round(pages.reduce((a, p) => a + fn(p), 0) / n);
    const pct = (pred: (p: Page) => boolean) => Math.round((pages.filter(pred).length / n) * 100);
    const grouped = new Map<string, { count: number; urls: string[] }>();
    for (const i of issues) {
      const key = i.message.split(/\s*[:(]/)[0].trim();
      const g = grouped.get(key) ?? { count: 0, urls: [] };
      g.count += 1; if (g.urls.length < 20) g.urls.push(i.url);
      grouped.set(key, g);
    }
    const topIssues = [...grouped.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
    // Health score: 100 - weighted issues per page
    const weighted = bySev.high.length * 3 + bySev.medium.length * 1.5 + bySev.low.length * 0.5;
    const health = Math.max(0, Math.min(100, Math.round(100 - (weighted / n) * 10)));
    return {
      health,
      avg_words: avg(p => p.word_count),
      avg_ms: avg(p => p.duration_ms),
      avg_kb: avg(p => p.bytes / 1024),
      pct_title: pct(p => !!p.title),
      pct_desc: pct(p => !!p.description),
      pct_h1: pct(p => p.h1_count > 0),
      noindex_count: pages.filter(p => p.noindex).length,
      broken_count: pages.filter(p => p.status >= 400).length,
      topIssues,
      slowest: [...pages].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 5),
      largest: [...pages].sort((a, b) => b.bytes - a.bytes).slice(0, 5),
      thinnest: [...pages].filter(p => p.status < 400).sort((a, b) => a.word_count - b.word_count).slice(0, 5),
    };
  }, [pages, issues, bySev.high.length, bySev.medium.length, bySev.low.length]);

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ crawl: data, aggregate }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `crawl-${id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const healthColor = aggregate.health >= 80 ? "text-emerald-400" : aggregate.health >= 60 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">Crawl: {data.start_url}</h1>
          <p className="text-sm text-muted-foreground">Status: {data.status} · {data.pages_crawled} pages · {issues.length} issues</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right"><div className="text-xs text-muted-foreground">Site health</div><div className={`text-3xl font-bold ${healthColor}`}>{aggregate.health}</div></div>
          <Button variant="outline" size="sm" onClick={() => mPdf.mutate()} disabled={mPdf.isPending}>{mPdf.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}PDF</Button>
          <Button variant="outline" size="sm" onClick={downloadJson}><FileJson className="h-4 w-4 mr-2" />JSON</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">High severity</div><div className="text-2xl font-semibold text-rose-400">{bySev.high.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Medium severity</div><div className="text-2xl font-semibold text-amber-400">{bySev.medium.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Low severity</div><div className="text-2xl font-semibold text-emerald-400">{bySev.low.length}</div></Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Site Averages</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Avg words</div><div className="font-semibold">{aggregate.avg_words.toLocaleString()}</div></div>
          <div><div className="text-xs text-muted-foreground">Avg load</div><div className="font-semibold">{aggregate.avg_ms} ms</div></div>
          <div><div className="text-xs text-muted-foreground">Avg size</div><div className="font-semibold">{aggregate.avg_kb} KB</div></div>
          <div><div className="text-xs text-muted-foreground">Broken (4xx/5xx)</div><div className={`font-semibold ${aggregate.broken_count ? "text-rose-400" : ""}`}>{aggregate.broken_count}</div></div>
          <div><div className="text-xs text-muted-foreground">Pages with title</div><div className="font-semibold">{aggregate.pct_title}%</div></div>
          <div><div className="text-xs text-muted-foreground">Pages with description</div><div className="font-semibold">{aggregate.pct_desc}%</div></div>
          <div><div className="text-xs text-muted-foreground">Pages with H1</div><div className="font-semibold">{aggregate.pct_h1}%</div></div>
          <div><div className="text-xs text-muted-foreground">Noindex pages</div><div className="font-semibold">{aggregate.noindex_count}</div></div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Top Issue Types</div>
        <div className="space-y-1.5">
          {aggregate.topIssues.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 text-xs border-b border-border/40 pb-1.5">
              <span className="truncate">{k}</span>
              <span className="font-semibold text-muted-foreground shrink-0">{v.count} page{v.count === 1 ? "" : "s"}</span>
            </div>
          ))}
          {aggregate.topIssues.length === 0 && <div className="text-sm text-muted-foreground">No issues.</div>}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><div className="text-sm font-semibold mb-2">Slowest pages</div><ul className="text-xs space-y-1">{aggregate.slowest.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.url.replace(/^https?:\/\/[^/]+/, "")}</span><span className="text-muted-foreground shrink-0">{p.duration_ms}ms</span></li>)}</ul></Card>
        <Card className="p-4"><div className="text-sm font-semibold mb-2">Largest pages</div><ul className="text-xs space-y-1">{aggregate.largest.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.url.replace(/^https?:\/\/[^/]+/, "")}</span><span className="text-muted-foreground shrink-0">{(p.bytes/1024).toFixed(0)}KB</span></li>)}</ul></Card>
        <Card className="p-4"><div className="text-sm font-semibold mb-2">Thinnest content</div><ul className="text-xs space-y-1">{aggregate.thinnest.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.url.replace(/^https?:\/\/[^/]+/, "")}</span><span className="text-muted-foreground shrink-0">{p.word_count}w</span></li>)}</ul></Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">All Issues</div>
        <div className="max-h-96 overflow-auto space-y-1">
          {issues.map((i, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs py-1 border-b border-border/40">
              <Badge variant={i.severity === "high" ? "destructive" : i.severity === "medium" ? "secondary" : "outline"} className="shrink-0">{i.severity}</Badge>
              <div className="flex-1 min-w-0"><div className="truncate text-muted-foreground">{i.url}</div><div>{i.message}</div></div>
            </div>
          ))}
          {issues.length === 0 && <div className="text-sm text-muted-foreground">No issues found.</div>}
        </div>
      </Card>

      <Card>
        <div className="p-3 border-b border-border"><Input placeholder="Filter pages…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" /></div>
        <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background">
            <tr><th className="px-3 py-2">URL</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">H1</th><th className="px-3 py-2">Words</th><th className="px-3 py-2">KB</th><th className="px-3 py-2">ms</th><th className="px-3 py-2">Alt-miss</th></tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                <td className="px-3 py-1.5 truncate max-w-xs" title={p.url}>{p.url.replace(/^https?:\/\/[^/]+/, "")}</td>
                <td className="px-3 py-1.5">{p.status}</td>
                <td className="px-3 py-1.5 truncate max-w-xs" title={p.title}>{p.title || <span className="text-rose-400">—</span>}</td>
                <td className="px-3 py-1.5">{p.h1_count}</td>
                <td className="px-3 py-1.5">{p.word_count}</td>
                <td className="px-3 py-1.5">{(p.bytes / 1024).toFixed(0)}</td>
                <td className="px-3 py-1.5">{p.duration_ms}</td>
                <td className="px-3 py-1.5">{p.images_missing_alt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}