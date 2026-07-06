import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCompetitors, addCompetitor, deleteCompetitor, getBacklinks } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/competitors")({ component: Competitors });

function Competitors() {
  const list = useServerFn(listCompetitors);
  const add = useServerFn(addCompetitor);
  const del = useServerFn(deleteCompetitor);
  const bl = useServerFn(getBacklinks);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["competitors"], queryFn: () => list() });
  const [domain, setDomain] = useState(""); const [notes, setNotes] = useState("");
  const [analysing, setAnalysing] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const mAdd = useMutation({ mutationFn: () => add({ data: { domain, notes } }), onSuccess: () => { setDomain(""); setNotes(""); qc.invalidateQueries({ queryKey: ["competitors"] }); toast.success("Competitor added"); }, onError: e => toast.error(e instanceof Error ? e.message : "Failed") });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }) });

  const runBacklinks = async (d: string) => {
    setAnalysing(d); setResult(null);
    try { const r = await bl({ data: { domain: d } }); setResult(r as never); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Backlink lookup failed"); }
    finally { setAnalysing(null); }
  };

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Competitors & Backlinks</h1><p className="text-sm text-muted-foreground">Track competitor domains. Backlink data uses your Semrush API key from Settings.</p></div>
      <Card className="p-4">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (domain) mAdd.mutate(); }}>
          <Input placeholder="competitor.com" value={domain} onChange={(e) => setDomain(e.target.value)} className="max-w-xs" />
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="flex-1 min-h-[40px] max-h-24" />
          <Button disabled={mAdd.isPending}>Add</Button>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Domain</th><th className="px-4 py-2">Notes</th><th className="px-4 py-2 w-48">Actions</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map(row => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{row.domain}</td>
                <td className="px-4 py-2 text-muted-foreground truncate max-w-md">{row.notes}</td>
                <td className="px-4 py-2"><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={analysing === row.domain} onClick={() => runBacklinks(row.domain)}><Search className="h-3.5 w-3.5 mr-1" />{analysing === row.domain ? "…" : "Backlinks"}</Button><Button size="sm" variant="ghost" onClick={() => mDel.mutate(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">No competitors yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {result && (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Backlink Overview</div>
          {(result as { configured?: boolean }).configured === false ? (
            <p className="text-sm text-muted-foreground">Add your Semrush API key in <b>Settings</b> to fetch live backlink data.</p>
          ) : (
            <pre className="text-xs bg-muted/30 p-3 rounded overflow-auto max-h-96">{JSON.stringify((result as { overview: unknown }).overview, null, 2)}</pre>
          )}
        </Card>
      )}
    </div>
  );
}