import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trophy, Check, X } from "lucide-react";
import { runAiSearchRank } from "@/lib/ai-search.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/ai-search-rank")({ component: Page });

function Page() {
  const run = useServerFn(runAiSearchRank);
  const [brand, setBrand] = useState("");
  const [queries, setQueries] = useState("");
  const list = queries.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const mut = useMutation({
    mutationFn: () => run({ data: { brand, queries: list } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => toast.success(`${r.visibility}% AI visibility (${r.hits}/${r.total})`),
  });
  const d = mut.data;
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Trophy className="h-6 w-6" />AI Search Rank</h1>
        <p className="text-sm text-muted-foreground">Measure how often your brand is mentioned across major AI models.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[240px_1fr] items-start">
        <div><Label>Your brand</Label><Input placeholder="Acme Analytics" value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
        <div>
          <Label>Queries (one per line, up to 10)</Label>
          <Textarea rows={4} placeholder={"best seo audit tool\ntop ai visibility platform"} value={queries} onChange={(e) => setQueries(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button onClick={() => mut.mutate()} disabled={!brand || list.length === 0 || mut.isPending}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Querying models…</> : "Measure AI rank"}
          </Button>
        </div>
      </Card>
      {d && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4"><div className="text-xs text-muted-foreground">Visibility</div><div className="text-3xl font-semibold">{d.visibility}%</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Mentions</div><div className="text-3xl font-semibold">{d.hits}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Total answers</div><div className="text-3xl font-semibold">{d.total}</div></Card>
          </div>
          <Card className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Query</TableHead><TableHead>Model</TableHead><TableHead>Mentioned</TableHead><TableHead>Position</TableHead><TableHead>Snippet</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{r.query}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.model}</TableCell>
                    <TableCell>{r.mentioned ? <Badge className="gap-1"><Check className="h-3 w-3" />Yes</Badge> : <Badge variant="secondary" className="gap-1"><X className="h-3 w-3" />No</Badge>}</TableCell>
                    <TableCell>{r.position ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-md truncate">{r.snippet ?? (r.error ? <span className="text-destructive">{r.error}</span> : "—")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}