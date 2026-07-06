import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

const MODELS = ["google/gemini-2.5-flash", "openai/gpt-5-mini", "google/gemini-2.5-pro"] as const;

type Ctx = { supabase: unknown; userId: string };

const rankInput = z.object({
  brand: z.string().min(1).max(120),
  queries: z.array(z.string().min(3).max(300)).min(1).max(10),
});

const compareInput = z.object({
  your_brand: z.string().min(1).max(120),
  competitors: z.array(z.string().min(1).max(120)).min(1).max(5),
  queries: z.array(z.string().min(3).max(300)).min(1).max(10),
});

function findRank(text: string, brand: string): { mentioned: boolean; position: number | null; snippet: string | null } {
  const lower = text.toLowerCase();
  const b = brand.toLowerCase();
  const idx = lower.indexOf(b);
  if (idx < 0) return { mentioned: false, position: null, snippet: null };
  // position = ordinal appearance (1-based) counting distinct brand-name-like tokens before it
  const before = text.slice(0, idx);
  const brandLikeBefore = (before.match(/\b[A-Z][A-Za-z0-9.\-]{1,}\b/g) ?? []).length;
  const position = Math.max(1, brandLikeBefore + 1);
  const start = Math.max(0, idx - 100);
  const end = Math.min(text.length, idx + brand.length + 100);
  return { mentioned: true, position, snippet: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "") };
}

async function askModel(model: string, query: string): Promise<string> {
  const { callAi } = await import("./ai.server");
  return callAi({
    model,
    system: "You are an AI search assistant. Answer the user's question factually, mentioning specific brands, products, or websites where relevant, as a real AI answer engine would.",
    user: query,
    temperature: 0.4,
  });
}

export const runAiSearchRank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof rankInput>) => rankInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const rows: Array<{ query: string; model: string; mentioned: boolean; position: number | null; snippet: string | null; response: string; error?: string }> = [];
    let hits = 0;
    for (const query of data.queries) {
      for (const model of MODELS) {
        try {
          const answer = await askModel(model, query);
          const r = findRank(answer, data.brand);
          if (r.mentioned) hits++;
          rows.push({ query, model, mentioned: r.mentioned, position: r.position, snippet: r.snippet, response: answer });
        } catch (e) {
          rows.push({ query, model, mentioned: false, position: null, snippet: null, response: "", error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    const total = data.queries.length * MODELS.length;
    const visibility = total ? Math.round((hits / total) * 100) : 0;
    await logToolRun({
      supabase, userId, tool: "ai_search_rank", status: "success",
      label: `${data.brand} · ${visibility}% visibility`,
      input: data as unknown as Record<string, unknown>,
      result: { brand: data.brand, hits, total, visibility, results: rows } as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { brand: data.brand, hits, total, visibility, results: rows };
  });

export const runAiSearchComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof compareInput>) => compareInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const brands = [data.your_brand, ...data.competitors];
    const perBrand: Record<string, { mentions: number; total: number }> = {};
    for (const b of brands) perBrand[b] = { mentions: 0, total: 0 };
    const rows: Array<{ query: string; model: string; per_brand: Record<string, boolean>; response: string; error?: string }> = [];
    for (const query of data.queries) {
      for (const model of MODELS) {
        try {
          const answer = await askModel(model, query);
          const per: Record<string, boolean> = {};
          for (const b of brands) {
            const m = findRank(answer, b).mentioned;
            per[b] = m;
            perBrand[b].total++;
            if (m) perBrand[b].mentions++;
          }
          rows.push({ query, model, per_brand: per, response: answer });
        } catch (e) {
          const per: Record<string, boolean> = {};
          for (const b of brands) { per[b] = false; perBrand[b].total++; }
          rows.push({ query, model, per_brand: per, response: "", error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    const scoreboard = brands.map((b) => ({
      brand: b,
      mentions: perBrand[b].mentions,
      total: perBrand[b].total,
      visibility: perBrand[b].total ? Math.round((perBrand[b].mentions / perBrand[b].total) * 100) : 0,
      is_you: b === data.your_brand,
    })).sort((a, z) => z.visibility - a.visibility);
    await logToolRun({
      supabase, userId, tool: "ai_search_comparison", status: "success",
      label: `${data.your_brand} vs ${data.competitors.join(", ")}`,
      input: data as unknown as Record<string, unknown>,
      result: { scoreboard, results: rows } as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { scoreboard, results: rows };
  });