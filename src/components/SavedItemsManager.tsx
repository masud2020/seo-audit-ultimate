import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Loader2, Pencil, Save, X, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listSavedItems, createSavedItem, updateSavedItem, deleteSavedItem, type SavedItem } from "@/lib/saved-items.functions";

type Table = "saved_links" | "saved_sheets";

export function SavedItemsManager({
  table, title, description, icon: Icon, urlPlaceholder,
}: {
  table: Table;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  urlPlaceholder: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listSavedItems);
  const create = useServerFn(createSavedItem);
  const update = useServerFn(updateSavedItem);
  const del = useServerFn(deleteSavedItem);

  const key = ["saved-items", table] as const;
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => list({ data: { table } }) });

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const mCreate = useMutation({
    mutationFn: () => create({ data: { table, name: name.trim(), url: url.trim(), notes: notes.trim() || null } }),
    onSuccess: () => { setName(""); setUrl(""); setNotes(""); invalidate(); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });
  const mUpdate = useMutation({
    mutationFn: (id: string) => update({ data: { table, id, name: editName.trim(), url: editUrl.trim(), notes: editNotes.trim() || null } }),
    onSuccess: () => { setEditingId(null); invalidate(); toast.success("Updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => del({ data: { table, id } }),
    onSuccess: () => { invalidate(); toast.success("Removed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const startEdit = (row: SavedItem) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditUrl(row.url);
    setEditNotes(row.notes ?? "");
  };

  const copy = async (v: string) => { await navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Icon className="h-6 w-6" />{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="p-4">
        <form
          className="grid gap-3 md:grid-cols-[1fr_2fr_auto] items-start"
          onSubmit={(e) => { e.preventDefault(); if (name.trim() && url.trim()) mCreate.mutate(); }}
        >
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <Input placeholder="Give it a memorable name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">URL</label>
            <Input placeholder={urlPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="pt-5">
            <Button disabled={mCreate.isPending || !name.trim() || !url.trim()}>
              {mCreate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Textarea rows={2} placeholder="Any context you want to remember" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">URL</th>
              <th className="px-4 py-2 hidden md:table-cell">Notes</th>
              <th className="px-4 py-2 hidden md:table-cell">Saved</th>
              <th className="px-4 py-2 w-40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</td></tr>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing saved yet.</td></tr>
            )}
            {(data ?? []).map((row) => {
              const editing = editingId === row.id;
              return (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 align-top">
                  <td className="px-4 py-2 font-medium">
                    {editing ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} /> : row.name}
                  </td>
                  <td className="px-4 py-2 max-w-md">
                    {editing ? (
                      <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                    ) : (
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{row.url}</a>
                    )}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground max-w-xs">
                    {editing ? (
                      <Textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{row.notes || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground whitespace-nowrap">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      {editing ? (
                        <>
                          <Button size="sm" variant="ghost" disabled={mUpdate.isPending} onClick={() => mUpdate.mutate(row.id)} title="Save">
                            {mUpdate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} title="Cancel"><X className="h-3.5 w-3.5" /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => copy(row.url)} title="Copy URL"><Copy className="h-3.5 w-3.5" /></Button>
                          <Button asChild size="sm" variant="ghost" title="Open"><a href={row.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(row)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => mDelete.mutate(row.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}