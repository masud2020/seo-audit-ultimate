import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const TOOL_KEYS = [
  "broken_links",
  "backlink_monitor",
  "ai_detection",
  "ai_citations",
  "ai_potential",
  "seo_news",
] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

export const TOOL_LABELS: Record<ToolKey, string> = {
  broken_links: "Broken Link Checker",
  backlink_monitor: "Backlink Monitor",
  ai_detection: "AI Content Detection",
  ai_citations: "AI Citation Checker",
  ai_potential: "AI Citation Potential",
  seo_news: "SEO Blog Feed",
};

export interface NotificationRow {
  id: string;
  tool: string;
  status: string;
  label: string | null;
  message: string;
  run_id: string | null;
  read: boolean;
  created_at: string;
}

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: NotificationRow[]; unread: number }> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id,tool,status,label,message,run_id,read,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const items = (data ?? []) as NotificationRow[];
    const unread = items.filter((n) => !n.read).length;
    return { items, unread };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; read?: boolean }) =>
    z.object({ id: z.string().uuid(), read: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: data.read ?? true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notifications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .delete()
      .not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface PrefRow {
  tool: ToolKey;
  in_app: boolean;
  notify_success: boolean;
  notify_error: boolean;
}

export const listNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ prefs: PrefRow[] }> => {
    const { data, error } = await context.supabase
      .from("notification_prefs")
      .select("tool,in_app,notify_success,notify_error");
    if (error) throw new Error(error.message);
    const map = new Map<string, PrefRow>();
    for (const row of (data ?? []) as PrefRow[]) map.set(row.tool, row);
    const prefs: PrefRow[] = TOOL_KEYS.map((tool) =>
      map.get(tool) ?? { tool, in_app: true, notify_success: false, notify_error: true },
    );
    return { prefs };
  });

const savePrefsSchema = z.object({
  prefs: z.array(
    z.object({
      tool: z.enum(TOOL_KEYS),
      in_app: z.boolean(),
      notify_success: z.boolean(),
      notify_error: z.boolean(),
    }),
  ),
});

export const saveNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => savePrefsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const rows = data.prefs.map((p) => ({ ...p, user_id: context.userId }));
    const { error } = await context.supabase
      .from("notification_prefs")
      .upsert(rows, { onConflict: "user_id,tool" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });