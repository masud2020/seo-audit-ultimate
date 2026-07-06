import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const MODELS = ["google/gemini-2.5-flash", "openai/gpt-5-mini", "google/gemini-2.5-pro"] as const;

const inputSchema = z.object({
  target_domain: z.string().min(3).max(255),
  prompts: z.array(z.string().min(3).max(400)).min(1).max(15),
});

function cleanDomain(d: string) {
  return d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
}

function countMentions(text: string, domain: string) {
  const re = new RegExp(domain.replace(/\./g, "\\."), "gi");
  return (text.match(re) ?? []).length;
}

function findSnippet(text: string, domain: string) {
  const idx = text.toLowerCase().indexOf(domain);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 120);
  const end = Math.min(text.length, idx + domain.length + 120);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export const runCitationCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inputSchema>) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { callAi } = await import("./ai.server");
    const domain = cleanDomain(data.target_domain);

    const { data: run, error } = await supabase.from("ai_citation_runs").insert({
      user_id: userId, target_domain: domain, prompts_count: data.prompts.length, models_count: MODELS.length,
    }).select().single();
    if (error) throw new Error(error.message);
    const runId = (run as { id: string }).id;

    let hits = 0;
    const rows: Array<Record<string, unknown>> = [];
    const results: Array<{ prompt: string; model: string; cited: boolean; mentions: number; snippet: string | null; response: string; error?: string }> = [];

    for (const prompt of data.prompts) {
      for (const model of MODELS) {
        try {
          const answer = await callAi({
            model,
            system: "You are an expert assistant. Answer the user's question factually and cite specific website domains or URLs where relevant, as a real AI search assistant would.",
            user: prompt,
            temperature: 0.4,
          });
          const mentions = countMentions(answer, domain);
          const cited = mentions > 0;
          const snippet = findSnippet(answer, domain);
          if (cited) hits++;
          const row = { run_id: runId, user_id: userId, prompt, model, cited, mentions, snippet, response: answer.slice(0, 4000), error: null };
          rows.push(row);
          results.push({ prompt, model, cited, mentions, snippet, response: answer });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          rows.push({ run_id: runId, user_id: userId, prompt, model, cited: false, mentions: 0, snippet: null, response: "", error: msg });
          results.push({ prompt, model, cited: false, mentions: 0, snippet: null, response: "", error: msg });
        }
      }
    }
    if (rows.length) await supabase.from("ai_citation_results").insert(rows);
    await supabase.from("ai_citation_runs").update({ hits }).eq("id", runId);

    return { runId, hits, total: data.prompts.length * MODELS.length, models: MODELS as unknown as string[], results };
  });

export const listCitationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data } = await supabase.from("ai_citation_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    return data ?? [];
  });