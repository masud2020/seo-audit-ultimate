import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { peopleAlsoSearch } from "@/lib/keyword-tools.functions";
import type { PasItem } from "@/lib/keyword-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/people-also-search")({ component: Page });

function Page() {
  const run = useServerFn(peopleAlsoSearch);
  const [seed, setSeed] = useState("");
  const [country, setCountry] = useState("US");
  const [loaded, setLoaded] = useState<{ items: PasItem[] } | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { seed, country, limit: 20 } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: () => setLoaded(null),
  });
  const view = mut.data ?? loaded;
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" />People Also Search</h1>
        <p className="text-sm text-muted-foreground">Related searches users typically make after a query.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_120px_auto] items-end">
        <div><Label>Query</Label><Input placeholder="best running shoes" value={seed} onChange={(e) => setSeed(e.target.value)} /></div>
        <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!seed || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Finding…</> : "Get related searches"}
        </Button>
      </Card>
      <RecentRuns<{ items: PasItem[] }>
        tool="people_also_search"
        onLoad={({ input, result }) => {
          const i = input as { seed?: string; country?: string };
          if (i?.seed) setSeed(i.seed);
          if (i?.country) setCountry(i.country);
          setLoaded(result);
        }}
      />
      {view && (
        <div className="grid gap-2 sm:grid-cols-2">
          {view.items.map((it, i) => (
            <Card key={i} className="p-3">
              <div className="font-medium">{it.query}</div>
              <div className="text-xs text-muted-foreground mt-1">{it.reason}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}