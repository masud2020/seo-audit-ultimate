import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiSettings, saveApiSettings } from "@/lib/misc.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ component: Settings });

function Settings() {
  const get = useServerFn(getApiSettings);
  const save = useServerFn(saveApiSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["api-settings"], queryFn: () => get() });
  const [form, setForm] = useState({ provider: "lovable", groq_key: "", gemini_key: "", openai_key: "", perplexity_key: "", claude_key: "", serpapi_key: "", semrush_key: "" });
  useEffect(() => { if (data) setForm({ provider: data.provider ?? "lovable", groq_key: data.groq_key ?? "", gemini_key: data.gemini_key ?? "", openai_key: data.openai_key ?? "", perplexity_key: data.perplexity_key ?? "", claude_key: data.claude_key ?? "", serpapi_key: (data as { serpapi_key?: string }).serpapi_key ?? "", semrush_key: (data as { semrush_key?: string }).semrush_key ?? "" }); }, [data]);
  const m = useMutation({ mutationFn: () => save({ data: form }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-settings"] }); toast.success("Saved"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed") });

  return (
    <div className="space-y-4 max-w-2xl">
      <div><h1 className="text-2xl font-semibold tracking-tight">API Settings</h1><p className="text-sm text-muted-foreground">By default, AI recommendations use the built-in Lovable AI gateway (no key needed). Optionally set your own provider keys.</p></div>
      <Card className="p-6 space-y-4">
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
          <Label>Semrush API key</Label>
          <Input type="password" value={form.semrush_key} onChange={(e) => setForm({ ...form, semrush_key: e.target.value })} placeholder="••••••••" />
          <p className="text-xs text-muted-foreground mt-1">Used by Competitors & Backlinks. Get one at semrush.com/api.</p>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save API Keys"}</Button>
      </Card>
    </div>
  );
}