import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, UserCircle, AlertTriangle } from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Your profile — SEO Audit Tool" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const load = useServerFn(getMyProfile);
  const save = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => load(),
    retry: false,
  });

  // Auth-user fallback so the page still shows something useful when the
  // server fn errors (e.g. RLS/has_role misconfig).
  const { data: authUser } = useQuery({
    queryKey: ["auth-user-basic"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });

  const rbacError = !!error && /has_role|permission/i.test(
    error instanceof Error ? error.message : String(error),
  );

  const [form, setForm] = useState({
    display_name: "",
    avatar_url: "",
    bio: "",
    company: "",
    website: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        display_name: data.display_name ?? "",
        avatar_url: data.avatar_url ?? "",
        bio: data.bio ?? "",
        company: data.company ?? "",
        website: data.website ?? "",
      });
    } else if (error && authUser) {
      const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
      setForm((f) => ({
        ...f,
        display_name:
          f.display_name ||
          (typeof meta.full_name === "string" ? meta.full_name : "") ||
          (typeof meta.name === "string" ? meta.name : "") ||
          (authUser.email ? authUser.email.split("@")[0] : ""),
        avatar_url:
          f.avatar_url ||
          (typeof meta.avatar_url === "string" ? meta.avatar_url : ""),
      }));
    }
  }, [data, error, authUser]);

  const mut = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const initials = (form.display_name || "?").trim().slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground">How you appear across the app.</p>
      </div>

      <Card className="p-6 space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
          </div>
        ) : (
          <>
            {error ? (
              <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">
                    {rbacError
                      ? "Couldn't verify your role permissions."
                      : "Couldn't load your saved profile."}
                  </div>
                  <div className="opacity-80">
                    Showing your account info from sign-in. Saving may fail until an admin fixes RBAC.
                    {error instanceof Error && (
                      <span className="block mt-1 opacity-70">{error.message}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {form.avatar_url ? <AvatarImage src={form.avatar_url} alt="" /> : null}
                <AvatarFallback><UserCircle className="h-8 w-8 text-muted-foreground" /></AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <div className="font-medium">{form.display_name || "Unnamed"}</div>
                <div className="text-muted-foreground text-xs">
                  {authUser?.email ?? initials}
                </div>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
            >
              <div className="grid gap-2">
                <Label htmlFor="display_name">Display name</Label>
                <Input id="display_name" value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avatar_url">Avatar URL</Label>
                <Input id="avatar_url" type="url" placeholder="https://…" value={form.avatar_url}
                  onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
              </div>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={200} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" type="url" placeholder="https://…" value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" rows={4} value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={1000} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={mut.isPending}>
                  {mut.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : "Save changes"}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}