import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export const PROVIDERS = [
  "lovable-gemini",
  "lovable-gpt5",
  "perplexity",
  "openai",
  "claude",
  "gemini",
] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<Provider, string> = {
  "lovable-gemini": "Gemini 2.5 Flash (Lovable AI)",
  "lovable-gpt5": "GPT-5 mini (Lovable AI)",
  perplexity: "Perplexity Sonar (real citations)",
  openai: "OpenAI GPT-4o (your key)",
  claude: "Anthropic Claude (your key)",
  gemini: "Google Gemini (your key)",
};

function cleanDomain(d: string) {
  return d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
}
function countMentions(text: string, needle: string) {
  if (!needle) return 0;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (text.match(re) ?? []).length;
}
function firstIndex(text: string, needle: string): number {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  return i;
}
function snippet(text: string, needle: string) {
  const i = firstIndex(text, needle);
  if (i < 0) return null;
  const s = Math.max(0, i - 100);
  const e = Math.min(text.length, i + needle.length + 100);
  return (s > 0 ? "…" : "") + text.slice(s, e) + (e < text.length ? "…" : "");
}
function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s)\]}"'<>]+/gi;
  return [...new Set((text.match(re) ?? []).map((u) => u.replace(/[.,;:]+$/, "")))];
}

// ---------------- Provider adapters ----------------

type ProviderCall = { text: string; citations: string[] };
type Keys = {
  perplexity?: string | null;
  openai?: string | null;
  claude?: string | null;
  gemini?: string | null;
};

async function callLovable(model: string, system: string, user: string): Promise<ProviderCall> {
  const { callAi } = await import("./ai.server");
  const text = await callAi({ model, system, user, temperature: 0.4 });
  return { text, citations: extractUrls(text) };
}

async function callPerplexity(system: string, user: string, key: string): Promise<ProviderCall> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Perplexity ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }>; citations?: string[] };
    const text = j.choices?.[0]?.message?.content ?? "";
    const cites = Array.isArray(j.citations) ? j.citations : extractUrls(text);
    return { text, citations: cites };
  } finally { clearTimeout(t); }
}

async function callOpenAI(system: string, user: string, key: string): Promise<ProviderCall> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.4,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content ?? "";
    return { text, citations: extractUrls(text) };
  } finally { clearTimeout(t); }
}

async function callClaude(system: string, user: string, key: string): Promise<ProviderCall> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { content?: Array<{ text?: string }> };
    const text = (j.content ?? []).map((c) => c.text ?? "").join("\n");
    return { text, citations: extractUrls(text) };
  } finally { clearTimeout(t); }
}

async function callGemini(system: string, user: string, key: string): Promise<ProviderCall> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("\n");
    return { text, citations: extractUrls(text) };
  } finally { clearTimeout(t); }
}

async function runProvider(provider: Provider, system: string, user: string, keys: Keys): Promise<ProviderCall> {
  switch (provider) {
    case "lovable-gemini": return callLovable("google/gemini-2.5-flash", system, user);
    case "lovable-gpt5":   return callLovable("openai/gpt-5-mini", system, user);
    case "perplexity":
      if (!keys.perplexity) throw new Error("Perplexity key not set in API Settings");
      return callPerplexity(system, user, keys.perplexity);
    case "openai":
      if (!keys.openai) throw new Error("OpenAI key not set in API Settings");
      return callOpenAI(system, user, keys.openai);
    case "claude":
      if (!keys.claude) throw new Error("Claude key not set in API Settings");
      return callClaude(system, user, keys.claude);
    case "gemini":
      if (!keys.gemini) throw new Error("Gemini key not set in API Settings");
      return callGemini(system, user, keys.gemini);
  }
}

async function loadKeys(supabase: Ctx["supabase"], userId: string): Promise<Keys> {
  const { data } = await supabase.from("api_settings").select("perplexity_key,openai_key,claude_key,gemini_key").eq("user_id", userId).maybeSingle();
  const row = (data ?? {}) as { perplexity_key?: string; openai_key?: string; claude_key?: string; gemini_key?: string };
  return {
    perplexity: row.perplexity_key || null,
    openai: row.openai_key || null,
    claude: row.claude_key || null,
    gemini: row.gemini_key || null,
  };
}

// ---------------- Modes ----------------

const providersSchema = z.array(z.enum(PROVIDERS)).min(1).max(6);

const brandSchema = z.object({
  target_domain: z.string().min(3).max(255),
  brand_name: z.string().min(1).max(120).optional().default(""),
  prompts: z.array(z.string().min(3).max(400)).min(1).max(10),
  competitors: z.array(z.string().min(2).max(120)).max(10).optional().default([]),
  providers: providersSchema,
});

export const runBrandVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof brandSchema>) => brandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const domain = cleanDomain(data.target_domain);
    const brand = (data.brand_name || domain.split(".")[0]).trim();
    const keys = await loadKeys(supabase, userId);
    const compList = data.competitors.map((c) => c.trim()).filter(Boolean);

    type Row = {
      prompt: string; provider: Provider; error?: string;
      cited: boolean; brand_mentions: number; domain_mentions: number;
      brand_position: number | null; competitor_mentions: Record<string, number>;
      snippet: string | null; response: string; citations: string[];
    };
    const rows: Row[] = [];
    let hits = 0;

    for (const prompt of data.prompts) {
      for (const provider of data.providers) {
        const system = "You are a knowledgeable assistant. Answer the user's question naturally and mention specific brand names, tools, or websites when relevant, as a real AI search assistant would.";
        try {
          const { text, citations } = await runProvider(provider, system, prompt, keys);
          const brand_mentions = countMentions(text, brand);
          const domain_mentions = countMentions(text, domain);
          const brand_position = brand_mentions > 0 ? firstIndex(text, brand) : (domain_mentions > 0 ? firstIndex(text, domain) : null);
          const competitor_mentions: Record<string, number> = {};
          for (const c of compList) competitor_mentions[c] = countMentions(text, c);
          const cited = brand_mentions > 0 || domain_mentions > 0 || citations.some((u) => u.toLowerCase().includes(domain));
          if (cited) hits++;
          rows.push({
            prompt, provider, cited, brand_mentions, domain_mentions,
            brand_position, competitor_mentions,
            snippet: snippet(text, brand) ?? snippet(text, domain),
            response: text.slice(0, 4000), citations: citations.slice(0, 10),
          });
        } catch (e) {
          rows.push({
            prompt, provider, cited: false, brand_mentions: 0, domain_mentions: 0,
            brand_position: null, competitor_mentions: {},
            snippet: null, response: "", citations: [],
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const total = rows.length;
    const score = total ? Math.round((hits / total) * 100) : 0;
    const compTotals: Record<string, number> = {};
    for (const c of compList) compTotals[c] = rows.reduce((s, r) => s + (r.competitor_mentions[c] ?? 0), 0);

    const summary = { hits, total, score, competitor_totals: compTotals, brand, domain };
    const { data: run } = await supabase.from("llm_visibility_runs").insert({
      user_id: userId, mode: "brand", target_domain: domain, topic: brand,
      prompts: data.prompts, providers: data.providers, competitors: compList,
      score, hits, total, summary, results: rows,
    }).select("id").single();

    await logToolRun({
      supabase, userId, tool: "ai_citations", status: "success",
      label: `Brand · ${brand} · ${score}% visibility`,
      input: { mode: "brand", brand, domain, prompts: data.prompts, providers: data.providers },
      result: { hits, total, score },
      ref_table: "llm_visibility_runs", ref_id: (run as { id: string } | null)?.id ?? null,
      duration_ms: Date.now() - started,
    });
    return { id: (run as { id: string } | null)?.id ?? null, hits, total, score, summary, results: rows };
  });

const citationSchema = z.object({
  target_domain: z.string().min(3).max(255),
  target_url: z.string().url().optional().or(z.literal("")).default(""),
  topic: z.string().min(3).max(300),
  providers: providersSchema,
});

export const runLlmCitationCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof citationSchema>) => citationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const domain = cleanDomain(data.target_domain);
    const keys = await loadKeys(supabase, userId);
    const url = data.target_url || "";

    type Row = {
      provider: Provider; error?: string;
      cited_domain: boolean; cited_url: boolean;
      citations: string[]; competing_citations: string[];
      response: string;
    };
    const rows: Row[] = [];
    let hits = 0;

    const prompt = `Provide a concise answer about: ${data.topic}\n\nList the most authoritative source URLs (published articles, docs, or official pages) you would cite for this answer. Include full https:// URLs.`;
    const system = "You are a research assistant. Provide well-sourced answers with real, verifiable URLs from authoritative sources.";

    for (const provider of data.providers) {
      try {
        const { text, citations } = await runProvider(provider, system, prompt, keys);
        const domainCites = citations.filter((u) => u.toLowerCase().includes(domain));
        const urlCites = url ? citations.filter((u) => u.toLowerCase().includes(url.toLowerCase().replace(/^https?:\/\//, ""))) : [];
        const cited_domain = domainCites.length > 0 || countMentions(text, domain) > 0;
        const cited_url = urlCites.length > 0 || (!!url && countMentions(text, url) > 0);
        if (cited_domain || cited_url) hits++;
        rows.push({
          provider, cited_domain, cited_url,
          citations: citations.slice(0, 15),
          competing_citations: citations.filter((u) => !u.toLowerCase().includes(domain)).slice(0, 10),
          response: text.slice(0, 4000),
        });
      } catch (e) {
        rows.push({
          provider, cited_domain: false, cited_url: false,
          citations: [], competing_citations: [], response: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const total = rows.length;
    const score = total ? Math.round((hits / total) * 100) : 0;
    // Top competing domains
    const domainCounts = new Map<string, number>();
    for (const r of rows) for (const u of r.competing_citations) {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "");
        domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
      } catch { /* skip */ }
    }
    const top_competing = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([host, count]) => ({ host, count }));
    const summary = { hits, total, score, top_competing };

    const { data: run } = await supabase.from("llm_visibility_runs").insert({
      user_id: userId, mode: "citation", target_domain: domain, target_url: url || null, topic: data.topic,
      providers: data.providers, score, hits, total, summary, results: rows,
    }).select("id").single();

    await logToolRun({
      supabase, userId, tool: "ai_citations", status: "success",
      label: `Citation · ${domain} · ${score}%`,
      input: { mode: "citation", domain, url, topic: data.topic, providers: data.providers },
      result: { hits, total, score },
      ref_table: "llm_visibility_runs", ref_id: (run as { id: string } | null)?.id ?? null,
      duration_ms: Date.now() - started,
    });
    return { id: (run as { id: string } | null)?.id ?? null, hits, total, score, summary, results: rows };
  });

const readinessSchema = z.object({ target_url: z.string().url() });

async function fetchPageHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 LLMVisibilityBot/1.0" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!r.ok) throw new Error(`Fetch ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

function analyzeHtml(html: string) {
  const pick = (re: RegExp) => (html.match(re) ?? [])[1] ?? null;
  const all = (re: RegExp) => [...html.matchAll(re)];
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const h1 = all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi).map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const h2 = all(/<h2[^>]*>([\s\S]*?)<\/h2>/gi).map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const h3 = all(/<h3[^>]*>([\s\S]*?)<\/h3>/gi).map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const jsonLd = all(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi).map((m) => m[1].trim());
  const schemaTypes: string[] = [];
  for (const raw of jsonLd) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        const t = item?.["@type"];
        if (typeof t === "string") schemaTypes.push(t);
        else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") schemaTypes.push(x);
      }
    } catch { /* skip */ }
  }
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  const faqLike = /<(details|summary)[^>]*>/i.test(html) || /question|answer/i.test(schemaTypes.join(",")) || /faq/i.test(schemaTypes.join(","));
  return {
    title, description, h1_count: h1.length, h2_count: h2.length, h3_count: h3.length,
    h1_samples: h1.slice(0, 3), h2_samples: h2.slice(0, 6),
    schema_types: [...new Set(schemaTypes)],
    canonical, og_title: ogTitle, word_count: words.length,
    text_sample: text.slice(0, 4000), faq_like: faqLike,
  };
}

function scoreReadiness(a: ReturnType<typeof analyzeHtml>) {
  let score = 0;
  const factors: Array<{ name: string; ok: boolean; weight: number; hint: string }> = [
    { name: "Descriptive <title>", ok: !!a.title && a.title.length >= 20 && a.title.length <= 70, weight: 10, hint: "20–70 chars, includes primary topic." },
    { name: "Meta description", ok: !!a.description && a.description.length >= 50, weight: 8, hint: "50–160 chars summarizing the page." },
    { name: "Single, clear H1", ok: a.h1_count === 1, weight: 10, hint: "Exactly one H1 that names the topic." },
    { name: "Section headings (H2+)", ok: a.h2_count >= 3, weight: 10, hint: "≥3 H2s so LLMs can extract sections." },
    { name: "Substantial content", ok: a.word_count >= 400, weight: 10, hint: "Aim for 400+ words of unique text." },
    { name: "Structured data (JSON-LD)", ok: a.schema_types.length > 0, weight: 15, hint: "Add schema.org Article/FAQPage/Product." },
    { name: "FAQ / Q&A blocks", ok: a.faq_like, weight: 10, hint: "Add FAQ or Q&A section — LLMs love them." },
    { name: "Canonical URL", ok: !!a.canonical, weight: 5, hint: "Add <link rel=\"canonical\">." },
    { name: "Open Graph title", ok: !!a.og_title, weight: 5, hint: "Add og:title for social & AI previews." },
    { name: "Named entities in H1/title", ok: !!a.title && /[A-Z][a-z]+/.test(a.title), weight: 7, hint: "Include the brand or entity name clearly." },
    { name: "Answer-first paragraph", ok: a.text_sample.length > 200, weight: 10, hint: "Open with a concise 1-paragraph answer." },
  ];
  for (const f of factors) if (f.ok) score += f.weight;
  return { score: Math.min(100, score), factors };
}

export const runAiReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof readinessSchema>) => readinessSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    let html = "";
    let fetchError: string | null = null;
    try { html = await fetchPageHtml(data.target_url); }
    catch (e) { fetchError = e instanceof Error ? e.message : String(e); }

    const analysis = html ? analyzeHtml(html) : null;
    const scoring = analysis ? scoreReadiness(analysis) : null;

    // LLM-generated fix suggestions using Lovable AI (server-side, no key needed)
    let recommendations: string[] = [];
    if (analysis) {
      try {
        const { callAi, extractJson } = await import("./ai.server");
        const raw = await callAi({
          model: "google/gemini-2.5-flash",
          system: "You are an AI-SEO expert who advises how to make web pages easier for LLMs (ChatGPT, Perplexity, Gemini) to summarize and cite. Reply as strict JSON only.",
          user: `URL: ${data.target_url}
Title: ${analysis.title ?? "(none)"}
Description: ${analysis.description ?? "(none)"}
H1: ${analysis.h1_samples.join(" | ")}
H2 samples: ${analysis.h2_samples.join(" | ")}
Schema types: ${analysis.schema_types.join(", ") || "(none)"}
Word count: ${analysis.word_count}
Text sample: ${analysis.text_sample.slice(0, 1800)}

Return JSON: {"recommendations":["5-8 short, concrete, action-oriented fixes to improve this page's chances of being cited by AI assistants"]}`,
          json: true,
        });
        const parsed = extractJson<{ recommendations?: string[] }>(raw);
        recommendations = Array.isArray(parsed?.recommendations) ? parsed!.recommendations!.slice(0, 8) : [];
      } catch { /* skip LLM recs on failure */ }
    }

    const summary = {
      score: scoring?.score ?? 0,
      factors: scoring?.factors ?? [],
      analysis, recommendations, fetch_error: fetchError,
    };
    const domain = (() => { try { return cleanDomain(new URL(data.target_url).hostname); } catch { return null; } })();

    const { data: run } = await supabase.from("llm_visibility_runs").insert({
      user_id: userId, mode: "readiness", target_domain: domain, target_url: data.target_url,
      score: scoring?.score ?? 0, hits: 0, total: 0, summary, results: [],
    }).select("id").single();

    await logToolRun({
      supabase, userId, tool: "ai_citations", status: fetchError ? "error" : "success",
      label: `Readiness · ${data.target_url} · ${scoring?.score ?? 0}/100`,
      input: { mode: "readiness", url: data.target_url },
      result: { score: scoring?.score ?? 0 },
      error: fetchError,
      ref_table: "llm_visibility_runs", ref_id: (run as { id: string } | null)?.id ?? null,
      duration_ms: Date.now() - started,
    });
    return { id: (run as { id: string } | null)?.id ?? null, ...summary };
  });

export const listLlmVisibilityRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data } = await supabase.from("llm_visibility_runs")
      .select("id,mode,target_domain,target_url,topic,score,hits,total,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(25);
    return data ?? [];
  });
