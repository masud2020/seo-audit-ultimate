import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiSettings, saveApiSettings } from "@/lib/misc.functions";
import { checkIsAdmin, getConnectorStatus, testConnector } from "@/lib/admin.functions";
import { testDomainMetricsKeys, type TestKeysResult } from "@/lib/domain-metrics.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, CheckCircle2, XCircle, ExternalLink, PlugZap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  // Authorization is enforced by the in-page AdminGate and by assertAdmin
  // inside every server function. A beforeLoad redirect caused false-positive
  // kicks during preload/session-hydration races.
  component: Settings,
});

function Settings() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">Admin-only. Manage API keys and workspace connectors that power the platform.</p>
      </div>
      <AdminGate>
        <ConnectorsPanel />
        <ApiKeysForm />
      </AdminGate>
    </div>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const admin = useServerFn(checkIsAdmin);
  const { data, isLoading } = useQuery({ queryKey: ["is-admin"], queryFn: () => admin() });
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>;
  if (!data?.isAdmin) {
    return (
      <Card className="p-8 max-w-lg space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Admin access required</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          This page manages workspace-wide API keys and connectors. Only admins can view or edit these settings.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/dashboard">Back to dashboard</Link></Button>
      </Card>
    );
  }
  return <>{children}</>;
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok
    ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Connected</Badge>
    : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Not connected</Badge>;
}

function ConnectorsPanel() {
  const get = useServerFn(getConnectorStatus);
  const test = useServerFn(testConnector);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["connector-status"], queryFn: () => get() });
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string; detail?: string; latencyMs: number; at: number }>>({});
  const [pending, setPending] = useState<string | null>(null);
  const runTest = async (key: "gsc" | "semrush" | "brevo" | "dataforseo") => {
    setPending(key);
    try {
      const r = await test({ data: { key } });
      setResults((prev) => ({ ...prev, [key]: { ok: r.ok, message: r.message, detail: r.detail, latencyMs: r.latencyMs, at: Date.now() } }));
      qc.invalidateQueries({ queryKey: ["connector-status"] });
      (r.ok ? toast.success : toast.error)(r.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test failed";
      setResults((prev) => ({ ...prev, [key]: { ok: false, message: msg, latencyMs: 0, at: Date.now() } }));
      toast.error(msg);
    } finally {
      setPending(null);
    }
  };
  const rows = [
    { key: "gsc" as const, name: "Google Search Console", hint: "OAuth via Workspace Connectors. Powers /gsc verification & site data.", managed: "connector" as const },
    { key: "semrush" as const, name: "Semrush", hint: "Workspace Connector preferred; API key below is a fallback. Powers Competitors, Backlinks, Gap Analysis, Disavow.", managed: "connector" as const },
    { key: "brevo" as const, name: "Brevo (email delivery)", hint: "Sends PDF audit reports. Requires a verified sender email below.", managed: "connector" as const },
    { key: "dataforseo" as const, name: "DataForSEO", hint: "Live SERP rank tracking. Configured via login + password below.", managed: "keys" as const },
  ];
  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Workspace Connectors</h2>
        <p className="text-sm text-muted-foreground">
          OAuth/API connections managed in your Lovable workspace. Non-connector integrations are configured with the keys below.
        </p>
      </div>
      <div className="grid gap-3">
        {rows.map((r) => {
          const st = data?.[r.key];
          const tr = results[r.key];
          const isPending = pending === r.key;
          return (
            <div key={r.key} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {isLoading ? <Badge variant="secondary">Checking…</Badge> : <StatusBadge ok={!!st?.connected} />}
                  {r.key === "semrush" && data?.semrush?.keyFallback && !data.semrush.connected && (
                    <Badge variant="secondary">Using API key fallback</Badge>
                  )}
                  {r.key === "brevo" && data?.brevo?.connected && !data.brevo.senderConfigured && (
                    <Badge variant="secondary">Sender email missing</Badge>
                  )}
                  {tr && (
                    <Badge variant={tr.ok ? "default" : "destructive"} className="gap-1">
                      {tr.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      Test {tr.ok ? "passed" : "failed"} · {tr.latencyMs}ms
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.hint}</p>
                {tr?.detail && !tr.ok && (
                  <p className="text-xs text-destructive mt-1 break-all font-mono">{tr.detail}</p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button variant="secondary" size="sm" onClick={() => runTest(r.key)} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <PlugZap className="mr-1 h-3 w-3" />}
                  {isPending ? "Testing…" : "Test connection"}
                </Button>
                {r.managed === "connector" && (
                  <Button asChild variant="outline" size="sm">
                    <a href="/projects/connectors" target="_blank" rel="noreferrer">
                      Manage <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        To connect or reconnect Google Search Console, Semrush, or Brevo, open the workspace Connectors panel in Lovable.
      </p>
    </Card>
  );
}

function ApiKeysForm() {
  const get = useServerFn(getApiSettings);
  const save = useServerFn(saveApiSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["api-settings"], queryFn: () => get() });
  const [form, setForm] = useState({
    provider: "lovable", groq_key: "", gemini_key: "", openai_key: "", perplexity_key: "", claude_key: "",
    serpapi_key: "", semrush_key: "", moz_token: "", majestic_key: "", psi_key: "", sender_email: "", sender_name: "", dataforseo_login: "", dataforseo_password: "",
  });
  useEffect(() => { if (data) setForm({
    provider: data.provider ?? "lovable",
    groq_key: data.groq_key ?? "",
    gemini_key: data.gemini_key ?? "",
    openai_key: data.openai_key ?? "",
    perplexity_key: data.perplexity_key ?? "",
    claude_key: data.claude_key ?? "",
    serpapi_key: (data as { serpapi_key?: string }).serpapi_key ?? "",
    semrush_key: (data as { semrush_key?: string }).semrush_key ?? "",
    moz_token: (data as { moz_token?: string }).moz_token ?? "",
    majestic_key: (data as { majestic_key?: string }).majestic_key ?? "",
    psi_key: (data as { psi_key?: string }).psi_key ?? "",
    sender_email: (data as { sender_email?: string }).sender_email ?? "",
    sender_name: (data as { sender_name?: string }).sender_name ?? "",
    dataforseo_login: (data as { dataforseo_login?: string }).dataforseo_login ?? "",
    dataforseo_password: (data as { dataforseo_password?: string }).dataforseo_password ?? "",
  }); }, [data]);
  const m = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-settings"] });
      qc.invalidateQueries({ queryKey: ["connector-status"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground">AI recommendations default to Lovable AI (no key needed). Set provider keys and third-party credentials below.</p>
      </div>
      <div>
        <Label>Preferred provider</Label>
        <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lovable">Lovable AI (default)</SelectItem>
            <SelectItem value="gemini">Google Gemini</SelectItem>
            <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
            <SelectItem value="claude">Anthropic Claude</SelectItem>
            <SelectItem value="groq">Groq</SelectItem>
            <SelectItem value="perplexity">Perplexity</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="pt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">AI Providers</h3></div>
      {[["Groq","groq_key"],["Gemini","gemini_key"],["OpenAI","openai_key"],["Perplexity","perplexity_key"],["Claude","claude_key"]].map(([label, k]) => (
        <div key={k}>
          <Label>{label} API key</Label>
          <Input type="password" value={(form as Record<string,string>)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder="••••••••" />
        </div>
      ))}
      <div className="pt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">SEO Data Providers</h3></div>
      <div>
        <Label>SerpAPI key</Label>
        <Input type="password" value={form.serpapi_key} onChange={(e) => setForm({ ...form, serpapi_key: e.target.value })} placeholder="••••••••" />
        <p className="text-xs text-muted-foreground mt-1">Used by Keyword Rank Tracker for live Google positions. Get one at serpapi.com — falls back to simulated positions if unset.</p>
      </div>
      <div>
        <Label>Semrush API key (fallback)</Label>
        <Input type="password" value={form.semrush_key} onChange={(e) => setForm({ ...form, semrush_key: e.target.value })} placeholder="••••••••" />
        <p className="text-xs text-muted-foreground mt-1">Only used if the Semrush Workspace Connector isn't linked.</p>
      </div>
      <div>
        <Label>Moz API token</Label>
        <Input type="password" value={form.moz_token} onChange={(e) => setForm({ ...form, moz_token: e.target.value })} placeholder="••••••••" autoComplete="off" />
        <p className="text-xs text-muted-foreground mt-1">Powers Page Authority (PA) and Spam Score in the Domain Metrics tool. Create at moz.com/products/api → your token.</p>
      </div>
      <div>
        <Label>Majestic API key</Label>
        <Input type="password" value={form.majestic_key} onChange={(e) => setForm({ ...form, majestic_key: e.target.value })} placeholder="••••••••" autoComplete="off" />
        <p className="text-xs text-muted-foreground mt-1">Powers Trust Flow (TF) and Citation Flow (CF). Get one at majestic.com/account/api-key.</p>
      </div>
      <TestDomainMetricsKeys />
      <div>
        <Label>PageSpeed Insights API key</Label>
        <Input type="password" value={form.psi_key} onChange={(e) => setForm({ ...form, psi_key: e.target.value })} placeholder="AIza…" autoComplete="off" />
        <p className="text-xs text-muted-foreground mt-1">Powers Core Web Vitals in audits. Anonymous PSI works but is capped at 25 req/day/IP. Create a key at console.cloud.google.com → APIs & Services → Credentials, and enable the <em>PageSpeed Insights API</em>.</p>
      </div>
      <div>
        <Label>DataForSEO login</Label>
        <Input value={form.dataforseo_login} onChange={(e) => setForm({ ...form, dataforseo_login: e.target.value })} placeholder="you@example.com" autoComplete="off" />
      </div>
      <div>
        <Label>DataForSEO password</Label>
        <Input type="password" value={form.dataforseo_password} onChange={(e) => setForm({ ...form, dataforseo_password: e.target.value })} placeholder="••••••••" autoComplete="new-password" />
        <p className="text-xs text-muted-foreground mt-1">Live SERP rank tracking. Sign up at dataforseo.com and use your API credentials.</p>
      </div>
      <div className="pt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Email Report Delivery</h3></div>
      <div>
        <Label>Sender name</Label>
        <Input value={form.sender_name} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} placeholder="Acme SEO" />
      </div>
      <div>
        <Label>Sender email</Label>
        <Input type="email" value={form.sender_email} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} placeholder="reports@yourdomain.com" />
        <p className="text-xs text-muted-foreground mt-1">Must be a verified Brevo sender. Emails send through the Brevo connector.</p>
      </div>
      <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save API Keys"}</Button>
    </Card>
  );
}

function TestDomainMetricsKeys() {
  const test = useServerFn(testDomainMetricsKeys);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TestKeysResult | null>(null);
  const run = async () => {
    setPending(true);
    try {
      const r = await test();
      setResult(r);
      const bothOk = r.moz.ok && r.majestic.ok;
      const anyConfigured = r.moz.configured || r.majestic.configured;
      if (!anyConfigured) toast.error("No Moz or Majestic keys configured yet — save keys first.");
      else if (bothOk) toast.success("Both keys verified");
      else toast.error("One or more keys failed — see details below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setPending(false);
    }
  };
  const Row = ({ label, r }: { label: string; r: TestKeysResult["moz"] }) => (
    <div className="flex items-start justify-between gap-3 rounded-md border p-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{label}</span>
          {!r.configured
            ? <Badge variant="secondary">Not configured</Badge>
            : r.ok
              ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />OK · {r.latencyMs}ms</Badge>
              : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed · {r.latencyMs}ms</Badge>}
        </div>
        <p className={`text-xs mt-1 break-all ${r.ok ? "text-muted-foreground" : "text-destructive"}`}>{r.message}</p>
      </div>
    </div>
  );
  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Test Moz & Majestic keys</div>
          <p className="text-xs text-muted-foreground">Runs a live probe against <code>moz.com</code>. Save first if you just changed a key.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <PlugZap className="mr-1 h-3 w-3" />}
          {pending ? "Testing…" : "Test keys"}
        </Button>
      </div>
      {result && (
        <div className="grid gap-2">
          <Row label="Moz (DA / PA / Spam)" r={result.moz} />
          <Row label="Majestic (TF / CF)" r={result.majestic} />
        </div>
      )}
    </div>
  );
}