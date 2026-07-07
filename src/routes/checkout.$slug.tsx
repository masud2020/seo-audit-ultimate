import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy, Smartphone, Search, ArrowLeft, Loader2 } from "lucide-react";
import {
  listPublicPlans,
  getPublicBkashSettings,
  submitBkashPayment,
  type PricingPlan,
  type BkashSettings,
} from "@/lib/pricing.functions";

export const Route = createFileRoute("/checkout/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Checkout — ${params.slug} plan · bKash` },
      { name: "description", content: `Pay for the ${params.slug} plan via bKash and activate your subscription.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const loadPlans = useServerFn(listPublicPlans);
  const loadSettings = useServerFn(getPublicBkashSettings);
  const submit = useServerFn(submitBkashPayment);

  const plansQ = useQuery({ queryKey: ["public-plans"], queryFn: () => loadPlans() });
  const settingsQ = useQuery({ queryKey: ["public-bkash"], queryFn: () => loadSettings() });

  const plan: PricingPlan | undefined = plansQ.data?.plans.find((p) => p.slug === slug);
  const settings: BkashSettings | undefined = settingsQ.data;

  const [session, setSession] = useState<{ email: string | null } | "loading" | null>("loading");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSession(data.user ? { email: data.user.email ?? null } : null));
  }, []);

  const [txId, setTxId] = useState("");
  const [sender, setSender] = useState("");

  const mut = useMutation({
    mutationFn: () => submit({ data: { plan_slug: slug, transaction_id: txId, sender_msisdn: sender } }),
    onSuccess: () => {
      toast.success("Payment submitted — we'll verify shortly");
      navigate({ to: "/billing" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  const copy = (v: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground"><Search className="h-4 w-4" /></div>
            <span className="text-sm font-semibold tracking-tight">SEO Audit Tool</span>
          </Link>
          <Link to="/"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="h-4 w-4" />Back</Button></Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {(plansQ.isLoading || settingsQ.isLoading) && (
          <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading checkout…
          </div>
        )}

        {!plansQ.isLoading && !plan && (
          <Card className="p-8 text-center space-y-3">
            <h1 className="text-xl font-semibold">Plan not found</h1>
            <p className="text-sm text-muted-foreground">The plan "{slug}" doesn't exist or is inactive.</p>
            <div><Link to="/#pricing"><Button variant="outline">See available plans</Button></Link></div>
          </Card>
        )}

        {plan && plan.price_bdt === 0 && (
          <Card className="p-8 text-center space-y-3">
            <h1 className="text-xl font-semibold">This plan is free</h1>
            <p className="text-sm text-muted-foreground">Sign up to start using the Free plan — no payment required.</p>
            <div><Link to="/auth"><Button>Create your account</Button></Link></div>
          </Card>
        )}

        {plan && plan.price_bdt > 0 && settings && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card className="p-6 space-y-5 h-fit">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">You're paying for</div>
                <div className="mt-1 flex items-center gap-2">
                  <h1 className="text-2xl font-semibold">{plan.name}</h1>
                  {plan.is_featured && <Badge>Popular</Badge>}
                </div>
                {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
              </div>
              <div className="rounded-lg border border-border p-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold">৳{plan.price_bdt.toLocaleString("en-BD")}</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <ul className="space-y-2 text-sm">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-6 space-y-6">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Smartphone className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-lg font-semibold">Pay with bKash</h2>
                  <p className="text-xs text-muted-foreground">Send Money → Submit TrxID → We verify</p>
                </div>
              </div>

              <ol className="space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">1</span>
                  <div className="flex-1">
                    Open your bKash app and choose <b>Send Money</b>.
                    <div className="mt-2 flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2">
                      <div>
                        <div className="text-xs text-muted-foreground">bKash number ({settings.account_type})</div>
                        <div className="font-mono text-base">{settings.merchant_number ?? "Not configured"}</div>
                      </div>
                      {settings.merchant_number && (
                        <Button size="sm" variant="ghost" onClick={() => copy(settings.merchant_number!)}><Copy className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">2</span>
                  <div className="flex-1">
                    Enter this exact amount:
                    <div className="mt-2 flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2">
                      <div className="font-mono text-base">৳{plan.price_bdt.toLocaleString("en-BD")}</div>
                      <Button size="sm" variant="ghost" onClick={() => copy(String(plan.price_bdt))}><Copy className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">3</span>
                  <div className="flex-1">
                    After sending, copy the <b>Transaction ID</b> from the bKash confirmation SMS and submit it below.
                  </div>
                </li>
              </ol>

              {settings.instructions && (
                <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-line">
                  {settings.instructions}
                </div>
              )}

              {session === "loading" ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking your session…</div>
              ) : session === null ? (
                <div className="rounded border border-border p-4 text-center space-y-3">
                  <p className="text-sm">You need to sign in to submit your transaction.</p>
                  <Link to="/auth"><Button>Sign in to continue</Button></Link>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
                  <div>
                    <Label htmlFor="tx">bKash Transaction ID (TrxID)</Label>
                    <Input id="tx" required minLength={4} maxLength={50} value={txId}
                      onChange={(e) => setTxId(e.target.value.trim())} placeholder="e.g. 9K4A2B7XYZ" className="font-mono" />
                  </div>
                  <div>
                    <Label htmlFor="sender">Your bKash number (sender)</Label>
                    <Input id="sender" required minLength={6} maxLength={20} value={sender}
                      onChange={(e) => setSender(e.target.value.trim())} placeholder="017XXXXXXXX" inputMode="tel" />
                  </div>
                  <Button type="submit" className="w-full" disabled={mut.isPending || !settings.merchant_number}>
                    {mut.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>) : "Submit for verification"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Signed in as <span className="font-medium">{session.email ?? "your account"}</span>
                  </p>
                </form>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}