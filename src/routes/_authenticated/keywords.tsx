import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listKeywords, addKeyword, deleteKeyword, refreshKeyword } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/keywords")({ component: Keywords });

function Keywords() {
  const list = useServerFn(listKeywords);
  const add = useServerFn(addKeyword);
  const del = useServerFn(deleteKeyword);
  const refresh = useServerFn(refreshKeyword);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["keywords"], queryFn: () => list() });
  const [k, setK] = useState(""); const [u, setU] = useState("");
  const mAdd = useMutation({ mutationFn: () => add({ data: { keyword: k, target_url: u } }), onSuccess: () => { setK(""); setU(""); qc.invalidateQueries({ queryKey: ["keywords"] }); toast.success("Keyword added"); } });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["keywords"] }) });
  const mRef = useMutation({ mutationFn: (id: string) => refresh({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["keywords"] }) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Keyword Rank Tracker</h1>
        <p className="text-sm text-muted-foreground">Track keyword positions over time. (Positions are simulated in Phase 1 — connect a SERP data provider for live results.)</p>
      </div>
      <Card className="p-4">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (k && u) mAdd.mutate(); }}>
          <Input placeholder="Keyword" value={k} onChange={(e) => setK(e.target.value)} className="max-w-xs" />
          <Input placeholder="Target URL" value={u} onChange={(e) => setU(e.target.value)} className="max-w-md" />
          <Button disabled={mAdd.isPending}>Add Keyword</Button>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Keyword</th><th className="px-4 py-2">URL</th><th className="px-4 py-2">Position</th><th className="px-4 py-2">Change</th><th className="px-4 py-2 w-32">Actions</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map(row => {
              const diff = row.previous_position != null && row.current_position != null ? row.previous_position - row.current_position : 0;
              return (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{row.keyword}</td>
                  <td className="px-4 py-2 truncate max-w-xs text-muted-foreground">{row.target_url}</td>
                  <td className="px-4 py-2 font-semibold">{row.current_position ?? "—"}</td>
                  <td className="px-4 py-2">{diff > 0 ? <span className="text-emerald-400 inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />+{diff}</span> : diff < 0 ? <span className="text-rose-400 inline-flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5" />{diff}</span> : <span className="text-muted-foreground inline-flex items-center gap-1"><Minus className="h-3.5 w-3.5" />0</span>}</td>
                  <td className="px-4 py-2"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => mRef.mutate(row.id)}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => mDel.mutate(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
                </tr>
              );
            })}
            {(!data || data.length === 0) && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No keywords tracked yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}