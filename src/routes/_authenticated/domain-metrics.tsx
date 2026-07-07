import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Gauge } from "lucide-react";
import { runDomainMetrics, type DomainMetricsResult } from "@/lib/domain-metrics.functions";
import { RecentRuns } from "@/components/recent-runs";
import { ToolReportExtras } from "@/components/reports/ToolReportExtras";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/domain-metrics")({ component: Page });

type Result = DomainMetricsResult & { run_id?: string | null };

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

function Metric({ label, value, hint, badge }: { label: string; value: React.ReactNode; hint?: string; badge?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function Page() {
  const run = useServerFn(runDomainMetrics);
  const [domain, setDomain] = useState("");
  const [loaded, setLoaded] = useState<Result | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => run({ data: { domain } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSuccess: () => { setLoaded(null); toast.success("Metrics loaded"); },
  });
  const view = mut.data ?? loaded;
  const runId = (mut.data as Result | undefined)?.run_id ?? loadedId;
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Gauge className="h-6 w-6" />DA, PA, Spam Score, Domain Age, TF, CF Checker</h1>
        <p className="text-sm text-muted-foreground">Domain / Page Authority and Spam Score from Moz, Trust & Citation Flow from Majestic, Authority Score & backlink profile from Semrush, domain age from WHOIS/RDAP. Add API keys under Admin Settings → API Keys.</p>
      </div>
      <Card className="p-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div><Label>Domain</Label><Input placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
        <Button onClick={() => mut.mutate()} disabled={!domain || mut.isPending}>
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</> : "Check metrics"}
        </Button>
      </Card>
      <RecentRuns<Result> tool="domain_metrics" onLoad={({ id, input, result }) => {
        const i = input as { domain?: string };
        if (i?.domain) setDomain(i.domain);
        setLoaded(result);
        setLoadedId(id);
      }} />
      {view && (
        <div className="space-y-4">
          {runId && <ToolReportExtras runId={runId} tool="domain_metrics" label={`Domain metrics · ${view.domain}`} result={view} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Domain Authority (DA)" value={fmt(view.domain_authority)} hint={view.domain_authority == null ? "Requires Moz API" : "Moz 0–100"} badge="Moz" />
            <Metric label="Page Authority (PA)" value={fmt(view.page_authority)} hint={view.page_authority == null ? "Requires Moz API" : "Moz 0–100"} badge="Moz" />
            <Metric label="Spam Score" value={fmt(view.spam_score)} hint={view.spam_score == null ? "Requires Moz API" : "Moz 0–17 (lower is better)"} badge="Moz" />
            <Metric label="Domain Age" value={view.domain_age_years !== null ? `${view.domain_age_years} yrs` : "—"} hint={fmtDate(view.created_date)} badge="WHOIS" />
            <Metric label="Trust Flow (TF)" value={fmt(view.trust_flow)} hint={view.trust_flow == null ? "Requires Majestic API" : "Majestic 0–100"} badge="Majestic" />
            <Metric label="Citation Flow (CF)" value={fmt(view.citation_flow)} hint={view.citation_flow == null ? "Requires Majestic API" : "Majestic 0–100"} badge="Majestic" />
            <Metric label="Authority Score" value={fmt(view.authority_score)} hint="Semrush 0–100" badge="Semrush" />
            <Metric label="Backlinks" value={fmt(view.backlinks_total)} hint={view.follow_pct !== null ? `${view.follow_pct}% follow` : undefined} badge="Semrush" />
            <Metric label="Referring Domains" value={fmt(view.referring_domains)} badge="Semrush" />
            <Metric label="Organic Keywords" value={fmt(view.organic_keywords)} badge="Semrush" />
            <Metric label="Est. Organic Traffic" value={fmt(view.organic_traffic)} hint="monthly" badge="Semrush" />
          </div>
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2">WHOIS / RDAP</h3>
            <dl className="grid gap-2 sm:grid-cols-2 text-sm">
              <div><dt className="text-muted-foreground text-xs">Registered</dt><dd>{fmtDate(view.created_date)}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Last updated</dt><dd>{fmtDate(view.updated_date)}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Expires</dt><dd>{fmtDate(view.expires_date)}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Registrar</dt><dd>{view.registrar ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground text-xs">Nameservers</dt><dd className="font-mono text-xs">{view.nameservers.length ? view.nameservers.join(", ") : "—"}</dd></div>
            </dl>
          </Card>
          {view.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-2">Notes</h3>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                {view.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}