import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getCrawl } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/crawler/$id")({ component: CrawlDetail });

interface Page { url: string; status: number; title: string; description: string; h1_count: number; word_count: number; bytes: number; duration_ms: number; canonical: string; noindex: boolean; images_missing_alt: number; internal_links: number; external_links: number; }
interface Issue { url: string; severity: "high" | "medium" | "low"; message: string; }

function CrawlDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getCrawl);
  const { data } = useQuery({ queryKey: ["crawl", id], queryFn: () => fn({ data: { id } }) });
  const [q, setQ] = useState("");
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const pages = (data.pages as unknown as Page[]) ?? [];
  const issues = (data.issues as unknown as Issue[]) ?? [];
  const filtered = pages.filter(p => p.url.toLowerCase().includes(q.toLowerCase()) || p.title.toLowerCase().includes(q.toLowerCase()));
  const bySev = { high: issues.filter(i => i.severity === "high"), medium: issues.filter(i => i.severity === "medium"), low: issues.filter(i => i.severity === "low") };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight truncate">Crawl: {data.start_url}</h1>
        <p className="text-sm text-muted-foreground">Status: {data.status} · {data.pages_crawled} pages · {issues.length} issues</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">High severity</div><div className="text-2xl font-semibold text-rose-400">{bySev.high.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Medium severity</div><div className="text-2xl font-semibold text-amber-400">{bySev.medium.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Low severity</div><div className="text-2xl font-semibold text-emerald-400">{bySev.low.length}</div></Card>
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