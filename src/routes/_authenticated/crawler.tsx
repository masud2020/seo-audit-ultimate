import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startCrawl, listCrawls, deleteCrawl } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Trash2, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/crawler")({ component: Crawler });

function Crawler() {
  const start = useServerFn(startCrawl);
  const list = useServerFn(listCrawls);
  const del = useServerFn(deleteCrawl);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["crawls"], queryFn: () => list() });
  const [url, setUrl] = useState(""); const [max, setMax] = useState(25);
  const m = useMutation({
    mutationFn: () => start({ data: { start_url: url, max_pages: max } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["crawls"] }); navigate({ to: "/crawler/$id", params: { id: r.id } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Crawl failed"),
  });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["crawls"] }) });

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Whole-Site Crawler</h1><p className="text-sm text-muted-foreground">Crawl up to 100 pages of your site and surface aggregated SEO issues.</p></div>
      <Card className="p-4">
        <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); if (url) m.mutate(); }}>
          <div className="flex-1 min-w-64"><label className="text-xs text-muted-foreground">Start URL</label><Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div className="w-32"><label className="text-xs text-muted-foreground">Max pages</label><Input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value) || 25)} /></div>
          <Button disabled={m.isPending || !url}>{m.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Crawling…</> : <><Play className="h-4 w-4 mr-2" />Start Crawl</>}</Button>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Start URL</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Pages</th><th className="px-4 py-2">Created</th><th className="px-4 py-2 w-24">Actions</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map(row => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-2 truncate max-w-md">{row.start_url}</td>
                <td className="px-4 py-2"><Badge variant={row.status === "complete" ? "default" : row.status === "error" ? "destructive" : "secondary"}>{row.status}</Badge></td>
                <td className="px-4 py-2">{row.pages_crawled}/{row.max_pages}</td>
                <td className="px-4 py-2 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-4 py-2"><div className="flex gap-1"><Button asChild size="sm" variant="ghost"><Link to="/crawler/$id" params={{ id: row.id }}><Eye className="h-3.5 w-3.5" /></Link></Button><Button size="sm" variant="ghost" onClick={() => mDel.mutate(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No crawls yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}