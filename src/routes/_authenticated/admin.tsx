import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  checkAdminStatus,
  claimAdminBootstrap,
  listAllUsers,
  setUserAdmin,
  deleteUserAccount,
  sendPasswordResetForUser,
  toggleUserBan,
  type AdminUserRow,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldAlert, ShieldCheck, Trash2, KeyRound, Ban, CheckCircle2, Search, Loader2, UserCog } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getProfileByUserId, updateProfileAsAdmin } from "@/lib/profile.functions";
import { useEffect } from "react";
import { listActivityLogs, type ActivityLogRow } from "@/lib/activity.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  // Authorization is enforced by the in-page AdminGate and by assertAdmin
  // inside every admin server function. A beforeLoad redirect here caused
  // false-positive kicks during preload/session-hydration races.
  component: AdminPage,
});

function AdminPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage user accounts, admin roles, and access.</p>
      </div>
      <AdminGate />
    </div>
  );
}

function AdminGate() {
  const check = useServerFn(checkAdminStatus);
  const claim = useServerFn(claimAdminBootstrap);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-status"], queryFn: () => check() });
  const bootstrap = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => { toast.success("You are now an admin"); qc.invalidateQueries({ queryKey: ["admin-status"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>;
  if (data?.isAdmin) return <UsersPanel />;
  return (
    <Card className="p-8 max-w-lg space-y-4">
      <div className="flex items-center gap-2 text-destructive">
        <ShieldAlert className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Admin access required</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Only admins can manage users. {data?.canBootstrap && "No admin exists yet — you can claim the first admin seat below."}
      </p>
      {data?.canBootstrap && (
        <Button onClick={() => bootstrap.mutate()} disabled={bootstrap.isPending}>
          {bootstrap.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
          Make me admin
        </Button>
      )}
      <Button asChild variant="outline" size="sm"><Link to="/dashboard">Back to dashboard</Link></Button>
    </Card>
  );
}

function UsersPanel() {
  const list = useServerFn(listAllUsers);
  const setRole = useServerFn(setUserAdmin);
  const del = useServerFn(deleteUserAccount);
  const reset = useServerFn(sendPasswordResetForUser);
  const ban = useServerFn(toggleUserBan);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; makeAdmin: boolean }) => setRole({ data: v }),
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (userId: string) => del({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const banMut = useMutation({
    mutationFn: (v: { userId: string; ban: boolean }) => ban({ data: v }),
    onSuccess: (_r, v) => { toast.success(v.ban ? "User banned" : "User unbanned"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const resetMut = useMutation({
    mutationFn: (email: string) => reset({ data: { email } }),
    onSuccess: () => toast.success("Password reset link generated"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const users: AdminUserRow[] = data?.users ?? [];
  const filtered = users.filter((u) => !q || (u.email ?? "").toLowerCase().includes(q.toLowerCase()) || u.id.includes(q));

  return (
    <div className="space-y-6">
    <Card className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Users ({users.length})</h2>
          <p className="text-sm text-muted-foreground">
            Admins: {users.filter((u) => u.is_admin).length} · Banned: {users.filter((u) => u.banned_until).length}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or id" className="pl-8 h-9" />
        </div>
      </div>

      {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading users…</div>}
      {error && <div className="p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load users"}</div>}

      {!isLoading && !error && (
        <div className="rounded border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">
                    <div className="font-sans text-sm">{u.email ?? "—"}</div>
                    <div className="text-muted-foreground">{u.id.slice(0, 8)}…</div>
                  </TableCell>
                  <TableCell>
                    {u.is_admin
                      ? <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />Admin</Badge>
                      : <Badge variant="secondary">User</Badge>}
                  </TableCell>
                  <TableCell>
                    {u.banned_until
                      ? <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />Banned</Badge>
                      : u.email_confirmed_at
                        ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" />Verified</Badge>
                        : <Badge variant="secondary">Unverified</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => roleMut.mutate({ userId: u.id, makeAdmin: !u.is_admin })}
                        disabled={roleMut.isPending}
                      >
                        {u.is_admin ? "Revoke admin" : "Make admin"}
                      </Button>
                      <AdminEditProfileButton userId={u.id} email={u.email} />
                      {u.email && (
                        <Button
                          size="sm" variant="ghost" title="Send password reset"
                          onClick={() => resetMut.mutate(u.email!)} disabled={resetMut.isPending}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost" title={u.banned_until ? "Unban" : "Ban"}
                        onClick={() => banMut.mutate({ userId: u.id, ban: !u.banned_until })} disabled={banMut.isPending}
                      >
                        <Ban className={`h-4 w-4 ${u.banned_until ? "text-destructive" : ""}`} />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete user?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes <span className="font-mono">{u.email ?? u.id}</span> and all their data. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => delMut.mutate(u.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
    <ActivityLogsPanel />
    </div>
  );
}

function AdminEditProfileButton({ userId, email }: { userId: string; email: string | null }) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(getProfileByUserId);
  const save = useServerFn(updateProfileAsAdmin);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-profile", userId],
    queryFn: () => load({ data: { userId } }),
    enabled: open,
  });
  const [form, setForm] = useState({ display_name: "", avatar_url: "", bio: "", company: "", website: "" });
  useEffect(() => {
    if (data) setForm({
      display_name: data.display_name ?? "",
      avatar_url: data.avatar_url ?? "",
      bio: data.bio ?? "",
      company: data.company ?? "",
      website: data.website ?? "",
    });
    else if (open && !isLoading) setForm({ display_name: "", avatar_url: "", bio: "", company: "", website: "" });
  }, [data, open, isLoading]);
  const mut = useMutation({
    mutationFn: () => save({ data: { userId, ...form } }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["admin-profile", userId] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" title="Edit profile" onClick={() => setOpen(true)}>
        <UserCog className="h-4 w-4" />
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit profile — {email ?? userId.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
            <div className="grid gap-2">
              <Label htmlFor="ap-name">Display name</Label>
              <Input id="ap-name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={120} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ap-avatar">Avatar URL</Label>
              <Input id="ap-avatar" type="url" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="ap-company">Company</Label>
                <Input id="ap-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={200} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ap-website">Website</Label>
                <Input id="ap-website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ap-bio">Bio</Label>
              <Textarea id="ap-bio" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={1000} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}