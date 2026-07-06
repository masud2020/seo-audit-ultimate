import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({ text: z.string().min(50).max(20000) });

type Result = {
  ai_probability: number;
  verdict: "human" | "mixed" | "likely_ai";
  confidence: "low" | "medium" | "high";
  signals: { name: string; score: number; note: string }[];
  summary: string;
};

export const detectAiContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inputSchema>) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const { callAi, extractJson } = await import("./ai.server");
    const prompt = `Analyze the following text and estimate the probability it was written by an AI language model.
Return STRICT JSON only. Schema:
{
  "ai_probability": number 0-1,
  "verdict": "human" | "mixed" | "likely_ai",
  "confidence": "low" | "medium" | "high",
  "signals": [{"name": string, "score": number 0-1, "note": string}],
  "summary": string (2-3 sentences)
}
Signals to consider: burstiness, perplexity/predictability, repetition, hedging phrases, generic transitions, lack of personal voice, uniform sentence length, over-structuring.

TEXT:
"""
${data.text}
"""`;
    const raw = await callAi({
      model: "google/gemini-2.5-flash",
      system: "You are a forensic text analyst. Reply with valid JSON only.",
      user: prompt,
      json: true,
      temperature: 0.2,
    });
    const parsed = extractJson<Result>(raw);
    if (!parsed) throw new Error("Model returned unparseable response");
    parsed.ai_probability = Math.max(0, Math.min(1, Number(parsed.ai_probability) || 0));
    return parsed;
  });