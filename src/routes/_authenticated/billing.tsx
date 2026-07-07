import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Clock, XCircle, Loader2, CreditCard } from "lucide-react";
import { getMyBilling } from "@/lib/pricing.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — SEO Audit Tool" }] }),
  component: BillingPage,
});

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

function BillingPage() {
  const load = useServerFn(getMyBilling);
  const { data, isLoading } = useQuery({ queryKey: ["my-billing"], queryFn: () => load() });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Your current plan and bKash payment history.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div>
          <div className="flex-1">
            {isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : data?.subscription ? (
              <>
                <div className="text-sm text-muted-foreground">Current plan</div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold capitalize">{data.subscription.plan_slug}</div>
                  <Badge>Active</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.subscription.expires_at ? `Renews / expires ${new Date(data.subscription.expires_at).toLocaleDateString()}` : "No expiry"}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">Current plan</div>
                <div className="text-lg font-semibold">Free</div>
              </>
            )}
          </div>
          <Link to="/"><Button variant="outline">Upgrade plan</Button></Link>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Payment history</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : (data?.payments.length ?? 0) === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">No payments yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>TrxID</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                  <TableCell className="capitalize">{p.plan_slug}</TableCell>
                  <TableCell className="font-mono text-xs">{p.transaction_id}</TableCell>
                  <TableCell className="text-xs">{p.sender_msisdn}</TableCell>
                  <TableCell>৳{p.amount_bdt.toLocaleString("en-BD")}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}