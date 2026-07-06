import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pingUrl, listPings } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ping")({ component: Ping });

function Ping() {
  const ping = useServerFn(pingUrl);
  const list = useServerFn(listPings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pings"], queryFn: () => list() });
  const [u, setU] = useState("");
  const m = useMutation({ mutationFn: () => ping({ data: { url: u } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["pings"] }); toast.success("Pinged"); setU(""); } });
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Ping Sites</h1><p className="text-sm text-muted-foreground">Notify search engines that a sitemap or page has been updated.</p></div>
      <Card className="p-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (u) m.mutate(); }}>
          <Input placeholder="https://example.com/sitemap.xml" value={u} onChange={(e) => setU(e.target.value)} />
          <Button disabled={m.isPending}>{m.isPending ? "Pinging…" : "Ping"}</Button>
        </form>
      </Card>
      <Card>
        <div className="p-4 text-sm font-semibold">Recent pings</div>
        <div className="divide-y divide-border">
          {(data ?? []).map(row => (
            <div key={row.id} className="p-4">
              <div className="flex justify-between items-center"><span className="text-sm truncate">{row.url}</span><span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span></div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(row.results as unknown as { service: string; ok: boolean; status: number }[]).map((r, i) => (
                  <Badge key={i} variant={r.ok ? "default" : "destructive"}>{r.service}: {r.status}</Badge>
                ))}
              </div>
            </div>
          ))}
          {(!data || data.length === 0) && <div className="p-6 text-center text-sm text-muted-foreground">No pings yet.</div>}
        </div>
      </Card>
    </div>
  );
}