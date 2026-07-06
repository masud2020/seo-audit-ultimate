import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { keywordGap, contentGap, backlinkGap } from "@/lib/gaps.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, GitCompareArrows } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gaps")({ component: GapsPage });

type Row = Record<string, string | number>;

function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}

function downloadCsv(name: string, rows: Row[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function GapsPage() {
  const kw = useServerFn(keywordGap);
  const co = useServerFn(contentGap);
  const bl = useServerFn(backlinkGap);
  const [you, setYou] = useState("");
  const [them, setThem] = useState("");
  const [db, setDb] = useState("us");

  const mKw = useMutation({ mutationFn: () => kw({ data: { your_domain: you, competitor_domain: them, database: db, limit: 100 } }), onError: e => toast.error(e instanceof Error ? e.message : "Failed") });
  const mCo = useMutation({ mutationFn: () => co({ data: { your_domain: you, competitor_domain: them, database: db, limit: 100 } }), onError: e => toast.error(e instanceof Error ? e.message : "Failed") });
  const mBl = useMutation({ mutationFn: () => bl({ data: { your_domain: you, competitor_domain: them, database: db, limit: 100 } }), onError: e => toast.error(e instanceof Error ? e.message : "Failed") });

  const canRun = you.trim().length > 2 && them.trim().length > 2;
  const runAll = () => { mKw.mutate(); mCo.mutate(); mBl.mutate(); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><GitCompareArrows className="h-6 w-6" />Gap Analysis</h1>
        <p className="text-sm text-muted-foreground">Compare your domain against a competitor across keywords, content, and backlinks. Uses your Semrush API key from Settings.</p>
      </div>
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4 items-end">
          <div><Label>Your domain</Label><Input placeholder="yoursite.com" value={you} onChange={e => setYou(e.target.value)} /></div>
          <div><Label>Competitor domain</Label><Input placeholder="competitor.com" value={them} onChange={e => setThem(e.target.value)} /></div>
          <div>
            <Label>Database</Label>
            <Select value={db} onValueChange={setDb}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["us","uk","ca","au","de","fr","es","it","nl","in","br","jp"].map(x => <SelectItem key={x} value={x}>{x.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runAll} disabled={!canRun || mKw.isPending || mCo.isPending || mBl.isPending}>
            {(mKw.isPending || mCo.isPending || mBl.isPending) ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</> : "Analyze"}
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">Keywords {mKw.data && `(${mKw.data.rows.length})`}</TabsTrigger>
          <TabsTrigger value="content">Content {mCo.data && `(${mCo.data.rows.length})`}</TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks {mBl.data && `(${mBl.data.rows.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="keywords">
          <Card>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Keywords the competitor ranks for that you don't.</div>
              {mKw.data && <Button size="sm" variant="outline" onClick={() => downloadCsv("keyword-gap.csv", mKw.data.rows as unknown as Row[])}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
            </div>
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background"><tr><th className="px-3 py-2">Keyword</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Volume</th><th className="px-3 py-2">CPC</th><th className="px-3 py-2">Difficulty</th><th className="px-3 py-2">Ranking URL</th></tr></thead>
                <tbody>
                  {(mKw.data?.rows ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/30"><td className="px-3 py-1.5 font-medium">{r.keyword}</td><td className="px-3 py-1.5">{r.position}</td><td className="px-3 py-1.5">{r.volume.toLocaleString()}</td><td className="px-3 py-1.5">${r.cpc.toFixed(2)}</td><td className="px-3 py-1.5">{r.difficulty}</td><td className="px-3 py-1.5 truncate max-w-xs" title={r.url}>{r.url}</td></tr>
                  ))}
                  {!mKw.data && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Run an analysis to see gaps.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Competitor's top-traffic pages — inspiration for content you should cover.</div>
              {mCo.data && <Button size="sm" variant="outline" onClick={() => downloadCsv("content-gap.csv", mCo.data.rows as unknown as Row[])}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
            </div>
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background"><tr><th className="px-3 py-2">URL</th><th className="px-3 py-2">Keywords</th><th className="px-3 py-2">Traffic</th><th className="px-3 py-2">Traffic %</th><th className="px-3 py-2">Traffic Cost</th></tr></thead>
                <tbody>
                  {(mCo.data?.rows ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/30"><td className="px-3 py-1.5 truncate max-w-md" title={r.url}><a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.url}</a></td><td className="px-3 py-1.5">{r.keywords}</td><td className="px-3 py-1.5">{r.traffic.toLocaleString()}</td><td className="px-3 py-1.5">{r.traffic_pct.toFixed(2)}%</td><td className="px-3 py-1.5">${r.traffic_cost.toFixed(0)}</td></tr>
                  ))}
                  {!mCo.data && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Run an analysis to see top pages.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="backlinks">
          <Card>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Referring domains linking to your competitor but not to you — link-building targets.</div>
              {mBl.data && <Button size="sm" variant="outline" onClick={() => downloadCsv("backlink-gap.csv", mBl.data.rows as unknown as Row[])}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
            </div>
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-left uppercase text-muted-foreground sticky top-0 bg-background"><tr><th className="px-3 py-2">Domain</th><th className="px-3 py-2">Authority Score</th><th className="px-3 py-2">Backlinks</th><th className="px-3 py-2">IP</th></tr></thead>
                <tbody>
                  {(mBl.data?.rows ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/30"><td className="px-3 py-1.5 font-medium">{r.domain}</td><td className="px-3 py-1.5">{r.ascore}</td><td className="px-3 py-1.5">{r.backlinks.toLocaleString()}</td><td className="px-3 py-1.5 text-muted-foreground">{r.ip}</td></tr>
                  ))}
                  {!mBl.data && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Run an analysis to see linking domains.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}