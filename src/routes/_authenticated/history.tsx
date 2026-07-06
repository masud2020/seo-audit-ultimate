import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAudits, deleteAudit } from "@/lib/audit.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({ component: History });

function History() {
  const listFn = useServerFn(listAudits);
  const delFn = useServerFn(deleteAudit);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["audits"], queryFn: () => listFn() });
  const del = useMutation({ mutationFn: (id: string) => delFn({ data: { id } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["audits"] }); qc.invalidateQueries({ queryKey: ["dash"] }); toast.success("Deleted"); } });
  const [q, setQ] = useState("");
  const filtered = (data ?? []).filter(a => a.url.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit History</h1>
        <p className="text-sm text-muted-foreground">{data?.length ?? 0} audits total.</p>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Search by URL…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </div>
      <Card>
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> :
         filtered.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No audits found.</div> : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">URL</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 w-32">Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 truncate max-w-md"><Link to="/audit/$id" params={{ id: a.id }} className="hover:underline">{a.url}</Link></td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{a.status}</Badge></td>
                  <td className="px-4 py-2 font-semibold">{a.overall_score ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <Link to="/audit/$id" params={{ id: a.id }}><Button size="sm" variant="ghost"><Eye className="h-3.5 w-3.5" /></Button></Link>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}