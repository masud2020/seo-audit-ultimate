// Generic, cached AI recommendations per report section.
// Callable from every report page — the (report_id, report_type, section_slug)
// tuple keys a row in public.report_recommendations. If a row exists it is
// returned as-is; otherwise the section findings are sent to the Lovable AI
// Gateway and the response is persisted.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const REPORT_TYPES = ["audit", "site_audit", "tool_run"] as const;

export type Fix = { title: string; impact: "high" | "medium" | "low"; effort: "low" | "medium" | "high"; steps: string[] };
export type SectionRecommendations = { summary: string; fixes: Fix[]; cached: boolean; model: string | null };

const findingSchema = z.object({
  label: z.string(),
  status: z.enum(["pass", "warn", "fail", "info"]),
  detail: z.string().optional(),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
});

const inputSchema = z.object({
  report_id: z.string().uuid(),
  report_type: z.enum(REPORT_TYPES),
  section_slug: z.string().min(1).max(80),
  section_title: z.string().min(1).max(200),
  findings: z.array(findingSchema).max(60),
});

function coerceRecs(raw: unknown): { summary: string; fixes: Fix[] } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const rawFixes = Array.isArray(obj.fixes) ? (obj.fixes as Record<string, unknown>[]) : [];
  const fixes: Fix[] = rawFixes.slice(0, 8).map((f) => ({
    title: typeof f.title === "string" ? f.title : String(f.title ?? ""),
    impact: (f.impact === "high" || f.impact === "medium" || f.impact === "low") ? f.impact : "medium",
    effort: (f.effort === "high" || f.effort === "medium" || f.effort === "low") ? f.effort : "medium",
    steps: Array.isArray(f.steps) ? (f.steps as unknown[]).slice(0, 6).map(String) : [],
  }));
  return { summary, fixes };
}

export const generateSectionRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => inputSchema.parse(v))
  .handler(async ({ data, context }): Promise<SectionRecommendations> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    // Cache hit?
    const { data: cached } = await supabase
      .from("report_recommendations")
      .select("summary,fixes,model")
      .eq("report_id", data.report_id)
      .eq("report_type", data.report_type)
      .eq("section_slug", data.section_slug)
      .maybeSingle();
    if (cached && Array.isArray(cached.fixes) && cached.fixes.length) {
      return { summary: cached.summary ?? "", fixes: cached.fixes as Fix[], cached: true, model: (cached.model as string) ?? null };
    }

    const failing = data.findings.filter((f) => f.status === "fail" || f.status === "warn");
    if (!failing.length) {
      const empty = { summary: "No failing or warning checks in this section — nothing to fix.", fixes: [] };
      await supabase.from("report_recommendations").upsert({
        user_id: context.userId,
        report_id: data.report_id,
        report_type: data.report_type,
        section_slug: data.section_slug,
        summary: empty.summary,
        fixes: empty.fixes,
        model: null,
      }, { onConflict: "report_id,report_type,section_slug" });
      return { ...empty, cached: false, model: null };
    }

    const { callAi, extractJson } = await import("./ai.server");
    const model = "google/gemini-2.5-flash";
    const system = "You are a senior SEO / web performance auditor. Reply with STRICT JSON only, no prose.";
    const user = [
      `Report section: "${data.section_title}"`,
      `Failing / warning checks (JSON):`,
      JSON.stringify(failing),
      "",
      `Return JSON exactly of the shape:`,
      `{"summary":"1-3 sentence executive summary","fixes":[{"title":"...","impact":"high|medium|low","effort":"low|medium|high","steps":["step 1","step 2","step 3"]}]}`,
      `Rules: up to 5 fixes, most impactful first. Each fix has 2-5 concrete, code- or config-level steps. Never invent facts not in the findings.`,
    ].join("\n");

    try {
      const text = await callAi({ model, system, user, json: true, temperature: 0.2 });
      const parsed = extractJson<Record<string, unknown>>(text);
      const { summary, fixes } = coerceRecs(parsed);
      await supabase.from("report_recommendations").upsert({
        user_id: context.userId,
        report_id: data.report_id,
        report_type: data.report_type,
        section_slug: data.section_slug,
        summary,
        fixes,
        model,
      }, { onConflict: "report_id,report_type,section_slug" });
      return { summary, fixes, cached: false, model };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Surface the AI credit/rate-limit errors as-is so the UI can render them.
      throw new Error(message);
    }
  });

export const listSectionRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ report_id: z.string().uuid(), report_type: z.enum(REPORT_TYPES) }).parse(v))
  .handler(async ({ data, context }): Promise<Array<{ section_slug: string; summary: string; fixes: Fix[] }>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data: rows, error } = await supabase
      .from("report_recommendations")
      .select("section_slug,summary,fixes")
      .eq("report_id", data.report_id)
      .eq("report_type", data.report_type);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<{ section_slug: string; summary: string; fixes: Fix[] }>);
  });