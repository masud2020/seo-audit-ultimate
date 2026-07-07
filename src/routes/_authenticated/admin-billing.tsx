import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, Smartphone, CheckCircle2, XCircle, Clock, Save, ShieldAlert } from "lucide-react";
import {
  listAllPlansAdmin, upsertPlan, deletePlan,
  getBkashSettingsAdmin, updateBkashSettings,
  listAllPayments, reviewPayment,
  type PricingPlan, type BkashPaymentWithEmail,
} from "@/lib/pricing.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { autoApproveTrx, pollPendingPayments } from "@/lib/bkash-poller.functions";

export const Route = createFileRoute("/_authenticated/admin-billing")({
  head: () => ({ meta: [{ title: "Admin — Billing & bKash" }] }),
  component: AdminBillingPage,
});

function AdminBillingPage() {
  const admin = useServerFn(checkIsAdmin);
  const { data, isLoading } = useQuery({ queryKey: ["is-admin"], queryFn: () => admin() });
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>;
  if (!data?.isAdmin) {
    return (
      <Card className="p-8 max-w-lg space-y-3">
        <div className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" /><h2 className="text-lg font-semibold">Admin access required</h2></div>
        <p className="text-sm text-muted-foreground">Only admins can manage pricing plans, bKash settings, and payment approvals.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing admin</h1>
        <p className="text-sm text-muted-foreground">Manage pricing plans, bKash payment details, and review submitted payments.</p>
      </div>
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="bkash">bKash settings</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4"><PaymentsPanel /></TabsContent>
        <TabsContent value="plans" className="mt-4"><PlansPanel /></TabsContent>
        <TabsContent value="bkash" className="mt-4"><BkashPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Payments ----------------

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

function PaymentsPanel() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const load = useServerFn(listAllPayments);
  const review = useServerFn(reviewPayment);
  const autoApprove = useServerFn(autoApproveTrx);
  const pollNow = useServerFn(pollPendingPayments);
  const [trxInput, setTrxInput] = useState("");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", status],
    queryFn: () => load({ data: { status } }),
  });
  const mut = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject"; note?: string }) => review({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "approve" ? "Payment approved — subscription activated" : "Payment rejected");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const autoMut = useMutation({
    mutationFn: (trxId: string) => autoApprove({ data: { trxId } }),
    onSuccess: (r: any) => {
      if (r?.ok && r.status === "activated") toast.success("Auto-approved & subscription activated");
      else if (r?.ok && r.status === "already_processed") toast.info("That TrxID was already processed");
      else if (r?.reason === "not_found") toast.error("No pending payment found for that TrxID");
      else if (r?.reason === "amount_mismatch") toast.error("Amount mismatch — flagged for manual review");
      else toast.message(JSON.stringify(r));
      setTrxInput("");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const pollMut = useMutation({
    mutationFn: () => pollNow({}),
    onSuccess: (r: any) => {
      if (r?.configured === false) toast.warning(r.message ?? "bKash PGW not configured");
      else if (r?.ok) toast.success(`Polled ${r.checked} pending payment(s)`);
      else toast.error(r?.error ?? "Poll failed");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">bKash payments</h2>
        <Select value={status} onValueChange={(v: any) => setStatus(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded border border-border bg-muted/30 p-3 space-y-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">Auto-verify</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Paste bKash TrxID to auto-approve"
            value={trxInput}
            onChange={(e) => setTrxInput(e.target.value)}
            className="max-w-xs"
          />
          <Button
            size="sm"
            disabled={!trxInput.trim() || autoMut.isPending}
            onClick={() => autoMut.mutate(trxInput.trim())}
          >
            {autoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Match & approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pollMut.isPending}
            onClick={() => pollMut.mutate()}
          >
            {pollMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Poll bKash now"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Payments are auto-approved when bKash notifies the webhook or when a
          TrxID here matches a pending row. Configure the bKash Payment Gateway
          credentials as secrets to enable status polling.
        </p>
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading payments…</div>
      ) : (data?.payments.length ?? 0) === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">No payments in this view.</div>
      ) : (
        <div className="rounded border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>TrxID</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.payments.map((p) => <PaymentRow key={p.id} p={p} onAction={(a, note) => mut.mutate({ id: p.id, action: a, note })} pending={mut.isPending} />)}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function PaymentRow({ p, onAction, pending }: { p: BkashPaymentWithEmail; onAction: (a: "approve" | "reject", note?: string) => void; pending: boolean }) {
  const [note, setNote] = useState("");
  const canReview = p.status === "pending";
  return (
    <TableRow>
      <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
      <TableCell className="text-xs">{p.user_email ?? p.user_id.slice(0, 8) + "…"}</TableCell>
      <TableCell className="capitalize">{p.plan_slug}</TableCell>
      <TableCell className="font-mono text-xs">{p.transaction_id}</TableCell>
      <TableCell className="text-xs">{p.sender_msisdn}</TableCell>
      <TableCell>৳{p.amount_bdt.toLocaleString("en-BD")}</TableCell>
      <TableCell><StatusBadge status={p.status} /></TableCell>
      <TableCell className="text-right">
        {canReview ? (
          <div className="flex items-center justify-end gap-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={pending}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve this payment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Activates the <b className="capitalize">{p.plan_slug}</b> plan for {p.user_email ?? "this user"} for 30 days. Verify the TrxID <b>{p.transaction_id}</b> in your bKash account first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div>
                  <Label htmlFor={`note-${p.id}`}>Note (optional)</Label>
                  <Input id={`note-${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onAction("approve", note || undefined)}>Approve</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}><XCircle className="h-3.5 w-3.5 mr-1" />Reject</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject this payment?</AlertDialogTitle>
                  <AlertDialogDescription>The user's plan will not be activated. You can add a note explaining why.</AlertDialogDescription>
                </AlertDialogHeader>
                <div>
                  <Label htmlFor={`rn-${p.id}`}>Reason (optional)</Label>
                  <Input id={`rn-${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. TrxID not found in bKash" />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onAction("reject", note || undefined)}>Reject</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{p.admin_note || "—"}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------- Plans ----------------

const emptyPlan: PricingPlan = {
  id: "", slug: "", name: "", price_bdt: 0, currency: "BDT", description: "",
  features: [], cta_label: "Get started", is_featured: false, is_active: true, sort_order: 10,
};

function PlansPanel() {
  const load = useServerFn(listAllPlansAdmin);
  const save = useServerFn(upsertPlan);
  const del = useServerFn(deletePlan);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-plans"], queryFn: () => load() });
  const [editing, setEditing] = useState<PricingPlan | null>(null);

  const saveMut = useMutation({
    mutationFn: (v: PricingPlan) => save({
      data: {
        id: v.id || null,
        slug: v.slug, name: v.name, price_bdt: v.price_bdt,
        description: v.description ?? null, features: v.features,
        cta_label: v.cta_label, is_featured: v.is_featured, is_active: v.is_active, sort_order: v.sort_order,
      },
    }),
    onSuccess: () => { toast.success("Plan saved"); qc.invalidateQueries({ queryKey: ["admin-plans"] }); qc.invalidateQueries({ queryKey: ["public-plans"] }); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: ["admin-plans"] }); qc.invalidateQueries({ queryKey: ["public-plans"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pricing plans</h2>
        <Button size="sm" onClick={() => setEditing({ ...emptyPlan, sort_order: (data?.plans.length ?? 0) * 10 + 10 })}>
          <Plus className="h-4 w-4 mr-1" />New plan
        </Button>
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.plans ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{p.sort_order}</TableCell>
                  <TableCell className="font-medium">
                    {p.name} {p.is_featured && <Badge className="ml-1" variant="secondary">Popular</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.slug}</TableCell>
                  <TableCell>৳{p.price_bdt.toLocaleString("en-BD")}</TableCell>
                  <TableCell>{p.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Hidden</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                            <AlertDialogDescription>This removes the <b>{p.name}</b> plan. Existing subscriptions are not affected.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => delMut.mutate(p.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <PlanEditor plan={editing} onCancel={() => setEditing(null)} onSave={(v) => saveMut.mutate(v)} pending={saveMut.isPending} />
      )}
    </Card>
  );
}

function PlanEditor({ plan, onCancel, onSave, pending }: { plan: PricingPlan; onCancel: () => void; onSave: (v: PricingPlan) => void; pending: boolean }) {
  const [form, setForm] = useState<PricingPlan>(plan);
  const [featuresText, setFeaturesText] = useState(plan.features.join("\n"));
  useEffect(() => { setForm(plan); setFeaturesText(plan.features.join("\n")); }, [plan]);

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan.id ? "Edit plan" : "New plan"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...form, features: featuresText.split("\n").map(s => s.trim()).filter(Boolean) });
        }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <Label>Price (BDT / month)</Label>
              <Input type="number" min={0} required value={form.price_bdt} onChange={(e) => setForm({ ...form, price_bdt: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Features (one per line)</Label>
              <Textarea rows={6} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} placeholder="10 projects&#10;Unlimited audits&#10;Email support" />
            </div>
            <div>
              <Label>CTA label</Label>
              <Input value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
                <span className="text-sm">Featured</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <span className="text-sm">Active</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : (<><Save className="h-4 w-4 mr-2" />Save plan</>)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- bKash settings ----------------

function BkashPanel() {
  const load = useServerFn(getBkashSettingsAdmin);
  const save = useServerFn(updateBkashSettings);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-bkash"], queryFn: () => load() });
  const [form, setForm] = useState({ merchant_number: "", account_type: "personal" as "personal" | "merchant" | "agent", instructions: "" });
  useEffect(() => {
    if (data) setForm({
      merchant_number: data.merchant_number ?? "",
      account_type: (data.account_type as any) || "personal",
      instructions: data.instructions ?? "",
    });
  }, [data]);
  const mut = useMutation({
    mutationFn: () => save({ data: { ...form, instructions: form.instructions || null } }),
    onSuccess: () => { toast.success("bKash settings saved"); qc.invalidateQueries({ queryKey: ["admin-bkash"] }); qc.invalidateQueries({ queryKey: ["public-bkash"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Smartphone className="h-4 w-4" /></div>
        <div>
          <h2 className="text-lg font-semibold">bKash payment details</h2>
          <p className="text-xs text-muted-foreground">Shown to customers on the checkout page.</p>
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <form className="space-y-4 max-w-lg" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <Label>bKash number</Label>
            <Input required value={form.merchant_number} onChange={(e) => setForm({ ...form, merchant_number: e.target.value })} placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Account type</Label>
            <Select value={form.account_type} onValueChange={(v: any) => setForm({ ...form, account_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal (Send Money)</SelectItem>
                <SelectItem value="merchant">Merchant (Payment)</SelectItem>
                <SelectItem value="agent">Agent (Cash In)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Instructions</Label>
            <Textarea rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : (<><Save className="h-4 w-4 mr-2" />Save settings</>)}
          </Button>
        </form>
      )}
    </Card>
  );
}