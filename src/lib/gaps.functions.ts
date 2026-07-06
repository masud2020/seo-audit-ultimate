import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getKey(context: any): Promise<string> {
  const { data } = await context.supabase.from("api_settings").select("semrush_key").eq("user_id", context.userId).maybeSingle();
  const key = (data as { semrush_key?: string } | null)?.semrush_key;
  if (!key) throw new Error("Semrush API key missing. Add it in Settings → SEO Data Providers.");
  return key;
}

const inputSchema = z.object({
  your_domain: z.string().min(3).max(255),
  competitor_domain: z.string().min(3).max(255),
  database: z.string().min(2).max(10).optional().default("us"),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

// Keyword gap: keywords the competitor ranks for that YOU don't.
export const keywordGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inputSchema>) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { semrushCall, cleanDomain } = await import("./semrush.server");
    const key = await getKey(context);
    const you = cleanDomain(data.your_domain);
    const them = cleanDomain(data.competitor_domain);

    // Competitor's organic keywords
    const comp = await semrushCall({
      type: "domain_organic", domain: them, database: data.database,
      display_limit: String(data.limit),
      export_columns: "Ph,Po,Nq,Cp,Co,Kd,Ur",
    }, key);
    // Your organic keywords (bigger set to filter accurately)
    const yours = await semrushCall({
      type: "domain_organic", domain: you, database: data.database,
      display_limit: "500",
      export_columns: "Ph,Po",
    }, key);
    const yoursSet = new Set(yours.map(r => (r.Keyword || r.Ph || "").toLowerCase()));
    const gap = comp.filter(r => !yoursSet.has((r.Keyword || r.Ph || "").toLowerCase()))
      .map(r => ({
        keyword: r.Keyword || r.Ph,
        position: Number(r.Position || r.Po) || null,
        volume: Number(r["Search Volume"] || r.Nq) || 0,
        cpc: Number(r.CPC || r.Cp) || 0,
        competition: Number(r["Competition"] || r.Co) || 0,
        difficulty: Number(r["Keyword Difficulty Index"] || r.Kd) || 0,
        url: r.URL || r.Ur || "",
      }));
    return { rows: gap.sort((a, b) => b.volume - a.volume), you, them };
  });

// Content gap: competitor's top pages you should consider covering.
export const contentGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inputSchema>) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { semrushCall, cleanDomain } = await import("./semrush.server");
    const key = await getKey(context);
    const you = cleanDomain(data.your_domain);
    const them = cleanDomain(data.competitor_domain);
    const pages = await semrushCall({
      type: "domain_organic_pages", domain: them, database: data.database,
      display_limit: String(data.limit),
      export_columns: "Ur,Pc,Tr,Tg,Tc",
    }, key);
    return {
      you, them,
      rows: pages.map(r => ({
        url: r.URL || r.Ur || "",
        keywords: Number(r["Number of Keywords"] || r.Pc) || 0,
        traffic_pct: Number(r["Traffic (%)"] || r.Tr) || 0,
        traffic: Number(r.Traffic || r.Tg) || 0,
        traffic_cost: Number(r["Traffic Cost"] || r.Tc) || 0,
      })).sort((a, b) => b.traffic - a.traffic),
    };
  });

// Backlink gap: referring domains linking to competitor but not to you.
export const backlinkGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inputSchema>) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { semrushCall, cleanDomain } = await import("./semrush.server");
    const key = await getKey(context);
    const you = cleanDomain(data.your_domain);
    const them = cleanDomain(data.competitor_domain);
    const comp = await semrushCall({
      type: "backlinks_refdomains", target: them, target_type: "root_domain",
      display_limit: String(data.limit),
      export_columns: "domain,ascore,backlinks_num,ip",
    }, key);
    const yours = await semrushCall({
      type: "backlinks_refdomains", target: you, target_type: "root_domain",
      display_limit: "500",
      export_columns: "domain",
    }, key);
    const yoursSet = new Set(yours.map(r => (r.domain || "").toLowerCase()));
    const gap = comp.filter(r => !yoursSet.has((r.domain || "").toLowerCase()))
      .map(r => ({
        domain: r.domain,
        ascore: Number(r.ascore) || 0,
        backlinks: Number(r.backlinks_num) || 0,
        ip: r.ip || "",
      }));
    return { rows: gap.sort((a, b) => b.ascore - a.ascore), you, them };
  });