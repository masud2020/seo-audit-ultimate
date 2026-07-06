import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, GitCompareArrows, Check, X } from "lucide-react";
import { runAiSearchComparison } from "@/lib/ai-search.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/ai-search-comparison")({ component: Page });

function Page() {
  const run = useServerFn(runAiSearchComparison);
  const [you, setYou] = useState("");
  const [comp, setComp] = useState("");
  const [queries, setQueries] = useState("");
  const competitors = comp.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  const list = queries.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const mut = useMutation({
    mutationFn: () => run({ data: { your_brand: you, competitors, queries: list } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const d = mut.data;
  const brands = d ? d.scoreboard.map((s) => s.brand) : [];
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><GitCompareArrows className="h-6 w-6" />AI Search Comparison</h1>
        <p className="text-sm text-muted-foreground">Compare your brand's AI-answer visibility against competitors across models.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-2">
        <div><Label>Your brand</Label><Input placeholder="Acme" value={you} onChange={(e) => setYou(e.target.value)} /></div>
        <div><Label>Competitors (comma or newline separated, up to 5)</Label><Input placeholder="Competitor A, Competitor B" value={comp} onChange={(e) => setComp(e.target.value)} /></div>
        <div className="md:col-span-2">
          <Label>Queries (one per line, up to 10)</Label>
          <Textarea rows={4} placeholder={"best crm software\ntop analytics platform"} value={queries} onChange={(e) => setQueries(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button onClick={() => mut.mutate()} disabled={!you || !competitors.length || !list.length || mut.isPending}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Comparing…</> : "Compare"}
          </Button>
        </div>
      </Card>
      {d && (
        <>
          <Card className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Brand</TableHead><TableHead>Visibility</TableHead><TableHead>Mentions</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.scoreboard.map((s, i) => (
                  <TableRow key={s.brand} className={s.is_you ? "bg-primary/5" : ""}>
                    <TableCell className="font-mono">#{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.brand}{s.is_you && <Badge className="ml-2" variant="outline">You</Badge>}</TableCell>
                    <TableCell><Badge variant={s.visibility >= 50 ? "default" : "secondary"}>{s.visibility}%</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.mentions}/{s.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Query</TableHead><TableHead>Model</TableHead>
                {brands.map((b) => <TableHead key={b}>{b}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {d.results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs max-w-[200px] truncate">{r.query}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.model}</TableCell>
                    {brands.map((b) => (
                      <TableCell key={b}>{r.per_brand[b] ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
                    ))}
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