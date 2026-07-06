import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ Projects / Workspaces ============
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; domain: string }) =>
    z.object({ name: z.string().min(1).max(100), domain: z.string().min(3).max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("projects")
      .insert({ user_id: context.userId, name: data.name, domain: data.domain }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Scheduled audits ============
export const listScheduled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("scheduled_audits").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; cadence: "weekly" | "monthly"; email?: string; project_id?: string | null }) =>
    z.object({
      url: z.string().min(3).max(2048),
      cadence: z.enum(["weekly", "monthly"]),
      email: z.string().email().optional().or(z.literal("")),
      project_id: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const days = data.cadence === "weekly" ? 7 : 30;
    const next = new Date(Date.now() + days * 86400_000).toISOString();
    const { data: row, error } = await context.supabase.from("scheduled_audits").insert({
      user_id: context.userId, url: data.url, cadence: data.cadence,
      email: data.email || null, project_id: data.project_id ?? null,
      next_run_at: next, enabled: true,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; enabled: boolean }) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scheduled_audits")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scheduled_audits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Content optimizer (Lovable AI) ============
export const optimizeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_keyword: string; title?: string; content: string; project_id?: string | null }) =>
    z.object({
      target_keyword: z.string().min(1).max(200),
      title: z.string().max(300).optional().default(""),
      content: z.string().min(20).max(50_000),
      project_id: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { runContentOptimizer } = await import("./content-optimizer.server");
    const analysis = await runContentOptimizer(data.target_keyword, data.title ?? "", data.content);
    const { data: row, error } = await context.supabase.from("content_optimizations").insert({
      user_id: context.userId, project_id: data.project_id ?? null,
      target_keyword: data.target_keyword, title: data.title || null,
      content: data.content, analysis: analysis as never,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listOptimizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("content_optimizations")
      .select("id,target_keyword,title,created_at,analysis").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

// ============ Rank tracking dashboard (aggregate) ============
export const rankOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("keywords").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const tracked = rows.length;
    const scored = rows.filter(r => r.current_position != null);
    const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.current_position ?? 0), 0) / scored.length) : null;
    const top10 = rows.filter(r => (r.current_position ?? 999) <= 10).length;
    const top3 = rows.filter(r => (r.current_position ?? 999) <= 3).length;
    // Alerts: keywords whose position dropped by >= alert_threshold in the last check
    const alerts = rows.filter(r => {
      const cur = r.current_position, prev = r.previous_position;
      if (cur == null || prev == null) return false;
      return cur - prev >= (r.alert_threshold ?? 5);
    });
    return { tracked, avg, top10, top3, alerts, rows };
  });

export const updateKeywordAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; alert_threshold: number }) =>
    z.object({ id: z.string().uuid(), alert_threshold: z.number().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("keywords")
      .update({ alert_threshold: data.alert_threshold }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });