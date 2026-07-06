import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, HelpCircle } from "lucide-react";
import { peopleAlsoAsk } from "@/lib/keyword-tools.functions";
import type { PaaItem } from "@/lib/keyword-tools.functions";
import { RecentRuns } from "@/components/recent-runs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/people-also-ask")({ component: Page });

function Page() {
  const run = useServerFn(peopleAlsoAsk);
  const [seed, setSeed] = useState("");
  const [country, setCountry] = useState("US");
  const [loaded, setLoaded] = useState<{ items: PaaItem[] } | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { seed, country, limit: 15 } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: () => setLoaded(null),
  });
  const view = mut.data ?? loaded;
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><HelpCircle className="h-6 w-6" />People Also Ask</h1>
        <p className="text-sm text-muted-foreground">Common questions searchers ask, with concise answers.</p>
      </div>
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_120px_auto] items-end">
        <div><Label>Query</Label><Input placeholder="how to fix broken links" value={seed} onChange={(e) => setSeed(e.target.value)} /></div>
        <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!seed || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Asking…</> : "Get questions"}
        </Button>
      </Card>
      <RecentRuns<{ items: PaaItem[] }>
        tool="people_also_ask"
        onLoad={({ input, result }) => {
          const i = input as { seed?: string; country?: string };
          if (i?.seed) setSeed(i.seed);
          if (i?.country) setCountry(i.country);
          setLoaded(result);
        }}
      />
      {view && (
        <Card className="p-2">
          <Accordion type="multiple" className="w-full">
            {view.items.map((it, i) => (
              <AccordionItem key={i} value={`q-${i}`}>
                <AccordionTrigger className="text-left">{it.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{it.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}
    </div>
  );
}