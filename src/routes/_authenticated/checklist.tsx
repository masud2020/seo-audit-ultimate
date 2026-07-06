import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listChecklist, toggleChecklist } from "@/lib/misc.functions";
import { SEO_CHECKLIST_2026 } from "@/lib/data/seo-checklist";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/checklist")({ component: Checklist });

function Checklist() {
  const list = useServerFn(listChecklist);
  const toggle = useServerFn(toggleChecklist);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["checklist"], queryFn: () => list() });
  const m = useMutation({ mutationFn: (v: { key: string; checked: boolean }) => toggle({ data: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }) });
  const [q, setQ] = useState("");

  const checkedMap = useMemo(() => Object.fromEntries((data ?? []).map(r => [r.item_key, r.checked])), [data]);
  const filtered = SEO_CHECKLIST_2026.filter(i => i.title.toLowerCase().includes(q.toLowerCase()));
  const grouped = filtered.reduce<Record<string, typeof SEO_CHECKLIST_2026>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {});
  const done = SEO_CHECKLIST_2026.filter(i => checkedMap[i.key]).length;
  const pct = Math.round((done / SEO_CHECKLIST_2026.length) * 100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SEO Checklist 2026</h1>
        <p className="text-sm text-muted-foreground">{done} of {SEO_CHECKLIST_2026.length} completed ({pct}%)</p>
        <Progress value={pct} className="h-1 mt-2 max-w-md" />
      </div>
      <Input placeholder="Search checklist…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grouped).map(([cat, items]) => (
          <Card key={cat} className="p-4">
            <h3 className="text-sm font-semibold mb-3">{cat}</h3>
            <ul className="space-y-2">
              {items.map(i => (
                <li key={i.key} className="flex items-start gap-2 text-sm">
                  <Checkbox id={i.key} checked={!!checkedMap[i.key]} onCheckedChange={(v) => m.mutate({ key: i.key, checked: !!v })} className="mt-0.5" />
                  <label htmlFor={i.key} className={`cursor-pointer ${checkedMap[i.key] ? "line-through text-muted-foreground" : ""}`}>{i.title}</label>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}