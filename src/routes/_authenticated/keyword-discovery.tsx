import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { discoverKeywords } from "@/lib/keyword-tools.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/keyword-discovery")({ component: Page });

function Page() {
  const run = useServerFn(discoverKeywords);
  const [seed, setSeed] = useState("");
  const [country, setCountry] = useState("US");
  const [limit, setLimit] = useState(20);
  const mut = useMutation({
    mutationFn: () => run({ data: { seed, country, limit } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: (r) => toast.success(`${r.ideas.length} keyword ideas`),
  });
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Search className="h-6 w-6" />Keyword Discovery</h1>
        <p className="text-sm text-muted-foreground">AI-generated keyword ideas with intent, difficulty, and volume estimates.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_120px_120px_auto] items-end">
        <div><Label>Seed keyword</Label><Input placeholder="content marketing" value={seed} onChange={(e) => setSeed(e.target.value)} /></div>
        <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <div><Label>Count</Label><Input type="number" min={5} max={40} value={limit} onChange={(e) => setLimit(parseInt(e.target.value || "20", 10))} /></div>
        <Button onClick={() => mut.mutate()} disabled={!seed || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : "Discover"}
        </Button>
      </Card>
      {mut.data && (
        <Card className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Keyword</TableHead><TableHead>Intent</TableHead><TableHead>Volume</TableHead><TableHead>Difficulty</TableHead><TableHead>Why</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mut.data.ideas.map((i, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{i.keyword}</TableCell>
                  <TableCell><Badge variant="secondary">{i.intent}</Badge></TableCell>
                  <TableCell><Badge variant={i.estimated_volume === "high" ? "default" : "outline"}>{i.estimated_volume}</Badge></TableCell>
                  <TableCell><Badge variant={i.difficulty === "easy" ? "default" : i.difficulty === "hard" ? "destructive" : "secondary"}>{i.difficulty}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{i.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}