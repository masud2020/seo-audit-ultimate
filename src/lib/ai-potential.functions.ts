import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({ url: z.string().url() });

type CriterionScore = { id: string; label: string; score: number; note: string };
type Analysis = {
  overall_score: number;
  verdict: string;
  criteria: CriterionScore[];
  recommendations: string[];
  quotable_snippets: string[];
};

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const scoreCitationPotential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inputSchema>) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    let html = "";
    try {
      const r = await fetch(data.url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "LovableSEOBot/1.0" } });
      if (!r.ok) throw new Error(`URL returned ${r.status}`);
      html = await r.text();
    } finally { clearTimeout(t); }

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? "";
    const text = stripHtml(html).slice(0, 12000);

    const { callAi, extractJson } = await import("./ai.server");
    const prompt = `Score how likely this web page is to be cited by AI search assistants (ChatGPT, Perplexity, Gemini). Return STRICT JSON only.
Schema:
{
  "overall_score": number 0-100,
  "verdict": "Low" | "Moderate" | "High" | "Exceptional",
  "criteria": [
    {"id": "unique_data", "label": "Unique data / stats", "score": 0-100, "note": "..."},
    {"id": "quotable", "label": "Quotable statements", "score": 0-100, "note": "..."},
    {"id": "structure", "label": "Clear structure & headings", "score": 0-100, "note": "..."},
    {"id": "entities", "label": "Entity clarity", "score": 0-100, "note": "..."},
    {"id": "authority", "label": "Authority signals", "score": 0-100, "note": "..."},
    {"id": "freshness", "label": "Freshness / dated info", "score": 0-100, "note": "..."}
  ],
  "recommendations": [string, string, ...],
  "quotable_snippets": [string, string, ...]
}

URL: ${data.url}
TITLE: ${title}
CONTENT:
"""
${text}
"""`;
    const raw = await callAi({ model: "google/gemini-2.5-flash", system: "You are an expert AI-search SEO analyst. Reply with valid JSON only.", user: prompt, json: true, temperature: 0.3 });
    const parsed = extractJson<Analysis>(raw);
    if (!parsed) throw new Error("Model returned unparseable response");
    parsed.overall_score = Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score) || 0)));
    return { title, url: data.url, ...parsed };
  });