import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logToolRun } from "./tool-runs.server";

const seedSchema = z.object({
  seed: z.string().min(2).max(120),
  country: z.string().max(40).optional(),
  limit: z.number().int().min(5).max(40).default(20),
});

type Ctx = { supabase: unknown; userId: string };

async function askJson<T>(system: string, user: string): Promise<T> {
  const { callAi, extractJson } = await import("./ai.server");
  const raw = await callAi({
    model: "google/gemini-2.5-flash",
    system,
    user,
    json: true,
    temperature: 0.6,
  });
  const parsed = extractJson<T>(raw);
  if (!parsed) throw new Error("AI returned an unparseable response");
  return parsed;
}

export type KeywordIdea = {
  keyword: string;
  intent: "informational" | "navigational" | "commercial" | "transactional";
  estimated_volume: "low" | "medium" | "high";
  difficulty: "easy" | "medium" | "hard";
  reason: string;
};

export const discoverKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof seedSchema>) => seedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const country = data.country || "US";
    const out = await askJson<{ ideas: KeywordIdea[] }>(
      "You are an SEO keyword research assistant. Return only valid JSON.",
      `Generate ${data.limit} keyword ideas related to the seed: "${data.seed}" for the ${country} market.
Return JSON in this exact shape:
{"ideas":[{"keyword":"...","intent":"informational|navigational|commercial|transactional","estimated_volume":"low|medium|high","difficulty":"easy|medium|hard","reason":"one short sentence"}]}
Include a mix of head, mid-tail, and long-tail terms. No duplicates. No commentary outside JSON.`,
    );
    const ideas = (out.ideas ?? []).slice(0, data.limit);
    await logToolRun({
      supabase, userId, tool: "keyword_discovery", status: "success",
      label: `${data.seed} · ${ideas.length} ideas`,
      input: data as unknown as Record<string, unknown>,
      output: { ideas } as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { seed: data.seed, country, ideas };
  });

export type PasItem = { query: string; reason: string };

export const peopleAlsoSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof seedSchema>) => seedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const country = data.country || "US";
    const out = await askJson<{ items: PasItem[] }>(
      "You simulate Google's 'People also search for' block. Return only valid JSON.",
      `For the query "${data.seed}" in the ${country} market, list ${data.limit} closely related searches users typically make next.
Return JSON: {"items":[{"query":"...","reason":"why searchers pivot here"}]}
Order by likelihood. No duplicates. No commentary outside JSON.`,
    );
    const items = (out.items ?? []).slice(0, data.limit);
    await logToolRun({
      supabase, userId, tool: "people_also_search", status: "success",
      label: `${data.seed} · ${items.length} related`,
      input: data as unknown as Record<string, unknown>,
      output: { items } as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { seed: data.seed, country, items };
  });

export type PaaItem = { question: string; answer: string };

export const peopleAlsoAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof seedSchema>) => seedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const started = Date.now();
    const country = data.country || "US";
    const out = await askJson<{ items: PaaItem[] }>(
      "You simulate Google's 'People also ask' block. Return only valid JSON.",
      `For the query "${data.seed}" in the ${country} market, list ${data.limit} questions people commonly ask, each with a concise 1-3 sentence answer.
Return JSON: {"items":[{"question":"...","answer":"..."}]}
Cover different angles (what/why/how/best/vs). No duplicates. No commentary outside JSON.`,
    );
    const items = (out.items ?? []).slice(0, data.limit);
    await logToolRun({
      supabase, userId, tool: "people_also_ask", status: "success",
      label: `${data.seed} · ${items.length} questions`,
      input: data as unknown as Record<string, unknown>,
      output: { items } as unknown as Record<string, unknown>,
      duration_ms: Date.now() - started,
    });
    return { seed: data.seed, country, items };
  });