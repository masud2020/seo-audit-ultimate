import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProjects, createProject, deleteProject } from "@/lib/phase3.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Loader2, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/projects")({ component: ProjectsPage });

function ProjectsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listProjects);
  const add = useServerFn(createProject);
  const del = useServerFn(deleteProject);
  const q = useQuery({ queryKey: ["projects"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const mAdd = useMutation({
    mutationFn: () => add({ data: { name, domain } }),
    onSuccess: () => { setName(""); setDomain(""); qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project created"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const mDel = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">Track multiple sites separately. Audits, keywords and crawls can be linked to a project.</p>
      </div>
      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); if (name && domain) mAdd.mutate(); }} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]"><label className="text-xs text-muted-foreground">Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="My site" required /></div>
          <div className="flex-1 min-w-[220px]"><label className="text-xs text-muted-foreground">Domain</label><Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" required /></div>
          <Button disabled={mAdd.isPending}>{mAdd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}</Button>
        </form>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map(p => (
          <Card key={p.id} className="p-4 flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium"><FolderKanban className="h-4 w-4 text-primary" />{p.name}</div>
              <div className="text-xs text-muted-foreground truncate">{p.domain}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Created {new Date(p.created_at).toLocaleDateString()}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => mDel.mutate(p.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
          </Card>
        ))}
        {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No projects yet.</p>}
      </div>
    </div>
  );
}