import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.functions";
import { z } from "zod";

export interface ActivityLogRow {
  id: string;
  user_id: string | null;
  action: string;
  path: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
  email?: string | null;
}

function clientIpFromRequest(req: Request): string | null {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("true-client-ip") ||
    null
  );
}

const logInput = z.object({
  action: z.string().min(1).max(100),
  path: z.string().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const recordActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => logInput.parse(v))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const req = getRequest();
    const ip = clientIpFromRequest(req);
    const ua = req.headers.get("user-agent");
    await context.supabase.from("activity_logs").insert({
      user_id: context.userId,
      action: data.action,
      path: data.path ?? null,
      ip,
      user_agent: ua,
      metadata: (data.metadata ?? {}) as never,
    });
    return { ok: true };
  });

const listInput = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  q: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const listActivityLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => listInput.parse(v ?? {}))
  .handler(async ({ context, data }): Promise<{ logs: ActivityLogRow[] }> => {
    await assertAdmin(context);
    let query = context.supabase
      .from("activity_logs")
      .select("id,user_id,action,path,ip,user_agent,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.userId) query = query.eq("user_id", data.userId);
    if (data.action) query = query.eq("action", data.action);
    if (data.q) query = query.or(`ip.ilike.%${data.q}%,path.ilike.%${data.q}%,action.ilike.%${data.q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const logs = (rows ?? []) as ActivityLogRow[];
    const ids = Array.from(new Set(logs.map((l) => l.user_id).filter((x): x is string => !!x)));
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id,display_name")
        .in("user_id", ids);
      const nameMap = new Map<string, string | null>(
        ((profs ?? []) as Array<{ user_id: string; display_name: string | null }>).map((p) => [p.user_id, p.display_name]),
      );
      for (const l of logs) l.email = l.user_id ? nameMap.get(l.user_id) ?? null : null;
    }
    return { logs };
  });