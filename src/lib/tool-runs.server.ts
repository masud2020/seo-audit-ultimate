// Server-only helper to log a tool run into public.tool_runs.
// Called from within createServerFn handlers that already have `supabase` + userId.

export type ToolKey = "broken_links" | "backlink_monitor" | "ai_detection" | "ai_citations" | "ai_potential" | "seo_news" | "keyword_discovery" | "people_also_search" | "people_also_ask" | "ai_search_rank" | "ai_search_comparison";

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
    const runId = (data as { id: string }).id;
    await maybeNotify(a, runId);
    return runId;
  } catch (e) {
    console.warn("[tool_runs] log threw", e instanceof Error ? e.message : String(e));
    return null;
  }
}

const TOOL_LABELS: Record<string, string> = {
  broken_links: "Broken Link Checker",
  backlink_monitor: "Backlink Monitor",
  ai_detection: "AI Content Detection",
  ai_citations: "AI Citation Checker",
  ai_potential: "AI Citation Potential",
  seo_news: "SEO Blog Feed",
  keyword_discovery: "Keyword Discovery",
  people_also_search: "People Also Search",
  people_also_ask: "People Also Ask",
  ai_search_rank: "AI Search Rank",
  ai_search_comparison: "AI Search Comparison",
};

async function maybeNotify(a: LogRunArgs, runId: string): Promise<void> {
  const status = a.status ?? "success";
  if (status !== "success" && status !== "error") return;
  try {
    const { data: pref } = await a.supabase
      .from("notification_prefs")
      .select("in_app,notify_success,notify_error")
      .eq("user_id", a.userId)
      .eq("tool", a.tool)
      .maybeSingle();
    const p = (pref as { in_app: boolean; notify_success: boolean; notify_error: boolean } | null) ?? {
      in_app: true, notify_success: false, notify_error: true,
    };
    if (!p.in_app) return;
    if (status === "success" && !p.notify_success) return;
    if (status === "error" && !p.notify_error) return;
    const label = a.label ?? TOOL_LABELS[a.tool] ?? a.tool;
    const message = status === "success"
      ? `${TOOL_LABELS[a.tool] ?? a.tool} finished successfully.`
      : `${TOOL_LABELS[a.tool] ?? a.tool} failed${a.error ? `: ${a.error.slice(0, 200)}` : ""}`;
    await a.supabase.from("notifications").insert({
      user_id: a.userId,
      tool: a.tool,
      status,
      label,
      message,
      run_id: runId,
    });
  } catch (e) {
    console.warn("[notifications] emit failed", e instanceof Error ? e.message : String(e));
  }
}
