// Server-only helper to log a tool run into public.tool_runs.
// Called from within createServerFn handlers that already have `supabase` + userId.

export type ToolKey = "broken_links" | "backlink_monitor" | "ai_detection" | "ai_citations" | "ai_potential" | "seo_news";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = any;

export interface LogRunArgs {
  supabase: SupaLike;
  userId: string;
  tool: ToolKey;
  status?: "success" | "error" | "running";
  label?: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string | null;
  ref_table?: string | null;
  ref_id?: string | null;
  duration_ms?: number | null;
}

export async function logToolRun(a: LogRunArgs): Promise<string | null> {
  try {
    const { data, error } = await a.supabase.from("tool_runs").insert({
      user_id: a.userId,
      tool: a.tool,
      status: a.status ?? "success",
      label: a.label ?? null,
      input: a.input ?? {},
      result: a.result ?? {},
      error: a.error ?? null,
      ref_table: a.ref_table ?? null,
      ref_id: a.ref_id ?? null,
      duration_ms: a.duration_ms ?? null,
      finished_at: new Date().toISOString(),
    }).select("id").single();
    if (error) { console.warn("[tool_runs] log failed", error.message); return null; }
    return (data as { id: string }).id;
  } catch (e) {
    console.warn("[tool_runs] log threw", e instanceof Error ? e.message : String(e));
    return null;
  }
}
