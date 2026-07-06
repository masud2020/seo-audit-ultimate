import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSeoNews, listBlogSources, toggleBlogSource, addBlogSource } from "@/lib/seo-news.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Rss, RefreshCw, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/seo-news")({ component: SeoNewsPage });

function SeoNewsPage() {
  const fetchNews = useServerFn(fetchSeoNews);
  const listSources = useServerFn(listBlogSources);
  const toggle = useServerFn(toggleBlogSource);
  const addSrc = useServerFn(addBlogSource);
  const isAdminFn = useServerFn(checkIsAdmin);
  const qc = useQueryClient();

  const admin = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });
  const news = useQuery({ queryKey: ["seo-news"], queryFn: () => fetchNews({ data: {} }) });
  const sources = useQuery({ queryKey: ["blog-sources"], queryFn: () => listSources() });

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string>("all");
  const [newName, setNewName] = useState(""); const [newUrl, setNewUrl] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  const items = news.data?.items ?? [];
  const filtered = useMemo(() => items.filter(i => (source === "all" || i.source === source) && (!query || i.title.toLowerCase().includes(query.toLowerCase()) || i.snippet.toLowerCase().includes(query.toLowerCase()))), [items, source, query]);

  const refresh = useMutation({ mutationFn: () => fetchNews({ data: { force: true } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["seo-news"] }); toast.success("Refreshed"); } });
  const addSrcMut = useMutation({ mutationFn: () => addSrc({ data: { name: newName, url: newUrl } }), onSuccess: () => { setNewName(""); setNewUrl(""); qc.invalidateQueries({ queryKey: ["blog-sources"] }); toast.success("Added"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });

  const uniqueSources = [...new Set(items.map(i => i.source))];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Rss className="h-6 w-6" />SEO Blog Feed</h1>
          <p className="text-sm text-muted-foreground">Latest posts from Search Engine Journal, Moz, Ahrefs, Semrush, Majestic and more.</p>
        </div>
        <div className="flex gap-2">
          {admin.data?.isAdmin && <Button variant="outline" size="sm" onClick={() => setShowAdmin(v => !v)}>Manage sources</Button>}
          <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}Refresh
          </Button>
        </div>
      </div>

      {showAdmin && admin.data?.isAdmin && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Blog sources</div>
          <div className="space-y-1">
            {(sources.data ?? []).map(s => (
              <div key={s.id} className="flex items-center gap-3 text-sm border-b border-border/40 py-1">
                <div className="flex-1"><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground truncate">{s.url}</div></div>
                <Switch checked={s.enabled} onCheckedChange={(v) => toggle({ data: { id: s.id, enabled: v } }).then(() => qc.invalidateQueries({ queryKey: ["blog-sources"] }))} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-end pt-2">
            <div className="flex-1"><Input placeholder="Source name" value={newName} onChange={e => setNewName(e.target.value)} /></div>
            <div className="flex-[2]"><Input placeholder="https://blog.example.com/feed" value={newUrl} onChange={e => setNewUrl(e.target.value)} /></div>
            <Button size="sm" onClick={() => addSrcMut.mutate()} disabled={!newName || !newUrl || addSrcMut.isPending}>Add</Button>
          </div>
        </Card>
      )}

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Search titles…" value={query} onChange={e => setQuery(e.target.value)} className="max-w-xs h-8" />
        <Button size="sm" variant={source === "all" ? "default" : "outline"} onClick={() => setSource("all")}>All</Button>
        {uniqueSources.map(s => <Button key={s} size="sm" variant={source === s ? "default" : "outline"} onClick={() => setSource(s)}>{s}</Button>)}
        <div className="flex-1" />
        {news.data && <div className="text-xs text-muted-foreground">{filtered.length} posts · {news.data.cached ? "cached" : "fresh"}</div>}
      </Card>

      {news.isLoading ? (
        <Card className="p-12 text-center text-muted-foreground"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((it, i) => (
            <Card key={i} className="p-4 space-y-2 hover:border-primary/50 transition-colors">
              <div className="flex justify-between items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{it.source}</Badge>
                {it.published_at && <span className="text-[11px] text-muted-foreground">{new Date(it.published_at).toLocaleDateString()}</span>}
              </div>
              <a href={it.link} target="_blank" rel="noreferrer" className="block text-sm font-semibold hover:underline">{it.title}</a>
              {it.snippet && <p className="text-xs text-muted-foreground line-clamp-3">{it.snippet}</p>}
              <a href={it.link} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />Read</a>
            </Card>
          ))}
          {filtered.length === 0 && <Card className="p-6 text-center text-muted-foreground text-sm col-span-full">No posts found.</Card>}
        </div>
      )}
    </div>
  );
}