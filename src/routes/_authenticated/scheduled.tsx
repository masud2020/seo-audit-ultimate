import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listScheduled, createScheduled, deleteScheduled, toggleScheduled } from "@/lib/phase3.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/scheduled")({ component: ScheduledPage });

function ScheduledPage() {
  const qc = useQueryClient();
  const list = useServerFn(listScheduled);
  const add = useServerFn(createScheduled);
  const tog = useServerFn(toggleScheduled);
  const del = useServerFn(deleteScheduled);
  const q = useQuery({ queryKey: ["scheduled"], queryFn: () => list() });
  const [url, setUrl] = useState(""); const [cadence, setCadence] = useState<"weekly"|"monthly">("weekly"); const [email, setEmail] = useState("");
  const mAdd = useMutation({
    mutationFn: () => add({ data: { url, cadence, email } }),
    onSuccess: () => { setUrl(""); setEmail(""); qc.invalidateQueries({ queryKey: ["scheduled"] }); toast.success("Scheduled"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const mTog = useMutation({ mutationFn: (v: { id: string; enabled: boolean }) => tog({ data: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled"] }) });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled"] }) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scheduled Audits</h1>
        <p className="text-sm text-muted-foreground">Automatically re-audit URLs on a schedule. Optional email notifies you when the score changes.</p>
      </div>
      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); if (url) mAdd.mutate(); }} className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto] items-end">
          <div><label className="text-xs text-muted-foreground">URL</label><Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" required /></div>
          <div><label className="text-xs text-muted-foreground">Cadence</label>
            <Select value={cadence} onValueChange={(v) => setCadence(v as "weekly"|"monthly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
            </Select>
          </div>
          <div><label className="text-xs text-muted-foreground">Email (optional)</label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@site.com" /></div>
          <Button disabled={mAdd.isPending}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </form>
      </Card>
      <Card className="p-0 divide-y divide-border">
        {(q.data ?? []).map(s => (
          <div key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{s.url}</div>
              <div className="text-xs text-muted-foreground">{s.cadence} · next {new Date(s.next_run_at).toLocaleDateString()}{s.last_run_at ? ` · last ${new Date(s.last_run_at).toLocaleDateString()}` : ""}{s.email ? ` · ${s.email}` : ""}</div>
            </div>
            <Switch checked={s.enabled} onCheckedChange={(v) => mTog.mutate({ id: s.id, enabled: v })} />
            <Button variant="ghost" size="icon" onClick={() => mDel.mutate(s.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
          </div>
        ))}
        {q.data && q.data.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No scheduled audits.</div>}
      </Card>
      <p className="text-xs text-muted-foreground">The cron endpoint runs every hour and processes any URL whose next-run time has passed. Email notifications require configuring a Resend connector.</p>
    </div>
  );
}