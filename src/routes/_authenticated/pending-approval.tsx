import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyApproval } from "@/lib/approval.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Clock, ShieldCheck, ShieldX, Loader2, RefreshCw, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pending-approval")({
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const load = useServerFn(getMyApproval);
  const nav = useNavigate();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["my-approval"],
    queryFn: () => load(),
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (data.is_active) {
    // No longer blocked — bounce to dashboard.
    nav({ to: "/dashboard" });
    return null;
  }

  const rejected = data.status === "rejected";
  const expired = data.expired;

  return (
    <div className="max-w-xl mx-auto py-16">
      <Card className="p-8 space-y-4">
        <div className="flex items-center gap-2">
          {rejected ? (
            <><ShieldX className="h-6 w-6 text-destructive" />
              <h1 className="text-xl font-semibold">Access denied</h1></>
          ) : expired ? (
            <><Clock className="h-6 w-6 text-amber-500" />
              <h1 className="text-xl font-semibold">Monthly re-approval required</h1></>
          ) : (
            <><Clock className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Awaiting admin approval</h1></>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant={rejected ? "destructive" : expired ? "secondary" : "outline"}>
            {expired ? "expired" : data.status}
          </Badge>
          {data.approved_until && (
            <span className="text-muted-foreground">
              until {new Date(data.approved_until).toLocaleString()}
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {rejected
            ? "Your account was rejected by an administrator. Contact support if you believe this is a mistake."
            : expired
              ? "Your monthly access period has ended. An admin needs to renew your access before you can continue."
              : "Your account has been created, but an admin still needs to approve it. Every account is reviewed monthly."}
        </p>

        {data.approval_note && (
          <div className="rounded border bg-muted/40 p-3 text-sm">
            <div className="text-xs uppercase text-muted-foreground mb-1">Admin note</div>
            {data.approval_note}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Check status
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}
          >
            <LogOut className="h-3 w-3 mr-1" /> Sign out
          </Button>
        </div>

        <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Admins are notified automatically.
        </div>
      </Card>
    </div>
  );
}