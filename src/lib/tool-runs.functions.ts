import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const filterInput = z.object({
  tool: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

export const listToolRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof filterInput>) => filterInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    let q = supabase.from("tool_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(data.limit);
    if (data.tool && data.tool !== "all") q = q.eq("tool", data.tool);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to).toISOString());
    if (data.q) q = q.ilike("label", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getToolRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: row, error } = await supabase.from("tool_runs").select("*").eq("user_id", userId).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Run not found");
    return row;
  });

export const deleteToolRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { error } = await supabase.from("tool_runs").delete().eq("user_id", userId).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toolRunStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data } = await supabase.from("tool_runs").select("tool,status").eq("user_id", userId).limit(5000);
    const rows = (data ?? []) as Array<{ tool: string; status: string }>;
    const byTool: Record<string, { total: number; success: number; error: number }> = {};
    for (const r of rows) {
      const b = (byTool[r.tool] ??= { total: 0, success: 0, error: 0 });
      b.total++; if (r.status === "success") b.success++; else if (r.status === "error") b.error++;
    }
    return byTool;
  });
