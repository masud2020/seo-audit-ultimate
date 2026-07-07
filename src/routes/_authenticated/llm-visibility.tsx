import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  runBrandVisibility, runLlmCitationCheck, runAiReadiness, listLlmVisibilityRuns,
  PROVIDERS, PROVIDER_LABEL, type Provider,
} from "@/lib/llm-visibility.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Eye, Quote, Gauge, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/llm-visibility")({ component: LlmVisibilityPage });

const DEFAULT_PROVIDERS: Provider[] = ["lovable-gemini", "lovable-gpt5", "perplexity"];

function ProviderPicker({ value, onChange }: { value: Provider[]; onChange: (v: Provider[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PROVIDERS.map((p) => {
        const checked = value.includes(p);
        return (
          <label key={p} className="flex items-start gap-2 text-sm cursor-pointer rounded border p-2 hover:bg-muted/50">
            <Checkbox checked={checked} onCheckedChange={(v) => {
              if (v) onChange([...value, p]);
              else onChange(value.filter((x) => x !== p));
            }} />
            <div className="min-w-0">
              <div className="font-medium">{PROVIDER_LABEL[p]}</div>
              {(p === "perplexity" || p === "openai" || p === "claude" || p === "gemini") && (
                <div className="text-[10px] text-muted-foreground">Requires your API key in Settings</div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function LlmVisibilityPage() {
  const list = useServerFn(listLlmVisibilityRuns);
  const { data: history, refetch } = useQuery({ queryKey: ["llm-visibility-history"], queryFn: () => list() });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Eye className="h-6 w-6" />LLM Visibility</h1>
        <p className="text-sm text-muted-foreground">Track how AI assistants see your brand — mentions, citations, and page AI-readiness.</p>
      </div>

      <Tabs defaultValue="brand" className="space-y-4">
        <TabsList>
          <TabsTrigger value="brand"><Eye className="h-4 w-4 mr-1" />Brand Tracker</TabsTrigger>
          <TabsTrigger value="citation"><Quote className="h-4 w-4 mr-1" />Citation Checker</TabsTrigger>
          <TabsTrigger value="readiness"><Gauge className="h-4 w-4 mr-1" />AI Readiness</TabsTrigger>
        </TabsList>
        <TabsContent value="brand"><BrandTab onDone={() => refetch()} /></TabsContent>
        <TabsContent value="citation"><CitationTab onDone={() => refetch()} /></TabsContent>
        <TabsContent value="readiness"><ReadinessTab onDone={() => refetch()} /></TabsContent>
      </Tabs>

      {history && history.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Recent runs</h2>
          <div className="space-y-1">
            {history.slice(0, 10).map((r: { id: string; mode: string; target_domain: string | null; target_url: string | null; topic: string | null; score: number | null; hits: number; total: number; created_at: string }) => (
              <div key={r.id} className="flex items-center justify-between text-xs border-b border-border/60 pb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-[10px] uppercase">{r.mode}</Badge>
                  <span className="truncate">{r.target_url ?? r.target_domain ?? r.topic}</span>
                </div>
                <div className="text-muted-foreground shrink-0 flex items-center gap-3">
                  <span>{r.score ?? 0}{r.mode === "readiness" ? "/100" : "%"}</span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------- Brand Tracker ----------------
function BrandTab({ onDone }: { onDone: () => void }) {
  const run = useServerFn(runBrandVisibility);
  const [domain, setDomain] = useState("");
  const [brand, setBrand] = useState("");
  const [prompts, setPrompts] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [providers, setProviders] = useState<Provider[]>(DEFAULT_PROVIDERS);

  const mut = useMutation({
    mutationFn: () => run({ data: {
      target_domain: domain, brand_name: brand,
      prompts: prompts.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      competitors: competitors.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean),
      providers,
    }}),
    onSuccess: (r) => { toast.success(`Visibility ${r.score}% (${r.hits}/${r.total})`); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const d = mut.data;

  return (
    <Card className="p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>Your domain</Label><Input placeholder="yoursite.com" value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
        <div><Label>Brand name (optional)</Label><Input placeholder="e.g. Acme SEO" value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
      </div>
      <div>
        <Label>Prompts (one per line, up to 10)</Label>
        <Textarea rows={4} placeholder={"best seo audit tools 2026\nhow to fix broken backlinks\ntop keyword tracker for agencies"} value={prompts} onChange={(e) => setPrompts(e.target.value)} />
      </div>
      <div>
        <Label>Competitor brands / domains (comma or newline separated)</Label>
        <Textarea rows={2} placeholder={"ahrefs, semrush, moz"} value={competitors} onChange={(e) => setCompetitors(e.target.value)} />
      </div>
      <div>
        <Label>LLM providers to query</Label>
        <ProviderPicker value={providers} onChange={setProviders} />
      </div>
      <Button onClick={() => mut.mutate()} disabled={!domain || !prompts.trim() || providers.length === 0 || mut.isPending}>
        {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Querying…</> : "Run brand visibility check"}
      </Button>

      {d && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-semibold">{d.score}% visibility</div>
            <div className="text-sm text-muted-foreground">{d.hits} / {d.total} answers mentioned your brand or domain</div>
          </div>
          {Object.keys(d.summary.competitor_totals ?? {}).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.summary.competitor_totals as Record<string, number>).map(([k, v]) => (
                <Badge key={k} variant="outline">{k}: {v} mentions</Badge>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {d.results.map((r, i) => (
              <div key={i} className="border rounded p-2 text-xs space-y-1">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-mono text-[10px] truncate">{PROVIDER_LABEL[r.provider]}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={r.cited ? "default" : "outline"} className="text-[10px]">
                      {r.cited ? `mentioned ×${r.brand_mentions + r.domain_mentions}` : "not mentioned"}
                    </Badge>
                  </div>
                </div>
                <div className="text-muted-foreground italic">{r.error ?? r.snippet ?? "No mention"}</div>
                <div className="text-[10px] text-muted-foreground truncate">Prompt: {r.prompt}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------- Citation Checker ----------------
function CitationTab({ onDone }: { onDone: () => void }) {
  const run = useServerFn(runLlmCitationCheck);
  const [domain, setDomain] = useState("");
  const [url, setUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [providers, setProviders] = useState<Provider[]>(DEFAULT_PROVIDERS);
  const mut = useMutation({
    mutationFn: () => run({ data: { target_domain: domain, target_url: url, topic, providers } }),
    onSuccess: (r) => { toast.success(`${r.hits} of ${r.total} models cited you`); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const d = mut.data;

  return (
    <Card className="p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>Your domain</Label><Input placeholder="yoursite.com" value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
        <div><Label>Specific URL (optional)</Label><Input placeholder="https://yoursite.com/guide" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      </div>
      <div>
        <Label>Topic / question</Label>
        <Input placeholder="e.g. best on-page SEO checklist 2026" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>
      <div>
        <Label>LLM providers</Label>
        <ProviderPicker value={providers} onChange={setProviders} />
        <p className="text-[10px] text-muted-foreground mt-1">Perplexity returns real web citations — recommended for citation checks.</p>
      </div>
      <Button onClick={() => mut.mutate()} disabled={!domain || !topic || providers.length === 0 || mut.isPending}>
        {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</> : "Check citations"}
      </Button>

      {d && (
        <div className="space-y-3">
          <div className="text-lg font-semibold">Citation share: {d.score}% <span className="text-sm font-normal text-muted-foreground">({d.hits}/{d.total})</span></div>
          {d.summary.top_competing && d.summary.top_competing.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Top competing cited domains</div>
              <div className="flex flex-wrap gap-1">
                {d.summary.top_competing.map((x) => (
                  <Badge key={x.host} variant="secondary" className="text-[10px]">{x.host} ×{x.count}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {d.results.map((r, i) => (
              <div key={i} className="border rounded p-2 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-[10px]">{PROVIDER_LABEL[r.provider]}</span>
                  <div className="flex gap-1">
                    <Badge variant={r.cited_domain ? "default" : "outline"} className="text-[10px]">
                      {r.cited_domain ? <CheckCircle2 className="h-3 w-3 mr-0.5" /> : <XCircle className="h-3 w-3 mr-0.5" />}domain
                    </Badge>
                    {url && (
                      <Badge variant={r.cited_url ? "default" : "outline"} className="text-[10px]">
                        {r.cited_url ? <CheckCircle2 className="h-3 w-3 mr-0.5" /> : <XCircle className="h-3 w-3 mr-0.5" />}exact URL
                      </Badge>
                    )}
                  </div>
                </div>
                {r.error && <div className="text-destructive text-[11px]">{r.error}</div>}
                {r.citations.length > 0 && (
                  <div className="space-y-0.5">
                    {r.citations.slice(0, 6).map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className={`block truncate text-[11px] ${u.toLowerCase().includes(domain.toLowerCase()) ? "text-primary font-medium" : "text-muted-foreground"} hover:underline`}>
                        {u} <ExternalLink className="inline h-2.5 w-2.5" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------- AI Readiness ----------------
function ReadinessTab({ onDone }: { onDone: () => void }) {
  const run = useServerFn(runAiReadiness);
  const [url, setUrl] = useState("");
  const mut = useMutation({
    mutationFn: () => run({ data: { target_url: url } }),
    onSuccess: (r) => { toast.success(`AI-readiness ${r.score}/100`); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const d = mut.data;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <Label>Page URL</Label>
        <Input placeholder="https://yoursite.com/article" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className="text-xs text-muted-foreground mt-1">We fetch the HTML, analyze structure, and score how well LLMs can extract & cite it.</p>
      </div>
      <Button onClick={() => mut.mutate()} disabled={!url || mut.isPending}>
        {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</> : "Analyze AI-readiness"}
      </Button>

      {d && (
        <div className="space-y-4">
          {d.fetch_error ? (
            <div className="text-sm text-destructive">Fetch failed: {d.fetch_error}</div>
          ) : (
            <>
              <div className="text-3xl font-semibold">
                {d.score}<span className="text-base text-muted-foreground">/100</span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {d.factors.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border rounded p-2">
                    {f.ok ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-medium">{f.name} <span className="text-muted-foreground">(+{f.weight})</span></div>
                      {!f.ok && <div className="text-muted-foreground text-[11px]">{f.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {d.recommendations && d.recommendations.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">AI-suggested improvements</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {d.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {d.analysis && (
                <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
                  <div>Title: {d.analysis.title ?? "—"}</div>
                  <div>Words: {d.analysis.word_count} · H1: {d.analysis.h1_count} · H2: {d.analysis.h2_count} · H3: {d.analysis.h3_count}</div>
                  <div>Schema: {d.analysis.schema_types.join(", ") || "(none)"}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
