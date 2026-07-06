import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  // Supabase Auth Admin API requires the true service role key.
  // SUPABASE_SECRET_KEYS (new sb_secret_* format) is rejected with "User not allowed".
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEYS!;
  const isNewKey = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewKey && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input as any, { ...init, headers });
      },
    },
  });
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
}

export async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const checkAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean; canBootstrap: boolean }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin) return { isAdmin: true, canBootstrap: false };
    // Bootstrap: if no admins exist yet, allow the current user to claim admin.
    const { count } = await context.supabase
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    return { isAdmin: false, canBootstrap: (count ?? 0) === 0 };
  });

export const claimAdminBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { count } = await context.supabase
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Admin already exists");
    const supabaseAdmin = await getAdminClient();
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminClient();
    const users: AdminUserRow[] = [];
    let page = 1;
    // paginate up to 10 pages (1000 users) — sufficient for admin panels
    while (page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw new Error(error.message);
      const batch = data?.users ?? [];
      if (!batch.length) break;
      for (const u of batch) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          banned_until: (u as any).banned_until ?? null,
          is_admin: false,
        });
      }
      if (batch.length < 100) break;
      page++;
    }
    // attach admin flag
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role")
      .eq("role", "admin");
    const adminSet = new Set((roles ?? []).map((r: any) => r.user_id));
    for (const u of users) u.is_admin = adminSet.has(u.id);
    users.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { users };
  });

const setRoleInput = z.object({ userId: z.string().uuid(), makeAdmin: z.boolean() });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => setRoleInput.parse(v))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminClient();
    if (data.makeAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      if (data.userId === context.userId) {
        // prevent removing the last admin (self)
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) throw new Error("Cannot remove the last admin");
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const userIdInput = z.object({ userId: z.string().uuid() });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => userIdInput.parse(v))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const supabaseAdmin = await getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendPasswordResetForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ email: z.string().email() }).parse(v))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ userId: z.string().uuid(), ban: z.boolean() }).parse(v))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot ban yourself");
    const supabaseAdmin = await getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Legacy exports used by /settings and /seo-news --------------------

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!data };
  });

type ConnectorStatus = {
  gsc: { connected: boolean };
  semrush: { connected: boolean; keyFallback: boolean };
  brevo: { connected: boolean; senderConfigured: boolean };
  dataforseo: { connected: boolean };
};

export const getConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectorStatus> => {
    await assertAdmin(context);
    const { data: s } = await context.supabase
      .from("api_settings")
      .select("semrush_key,dataforseo_login,dataforseo_password,sender_email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const row = (s ?? {}) as {
      semrush_key?: string;
      dataforseo_login?: string;
      dataforseo_password?: string;
      sender_email?: string;
    };
    const hasEnv = (k: string) => !!process.env[k];
    return {
      gsc: { connected: hasEnv("GOOGLE_SEARCH_CONSOLE_API_KEY") },
      semrush: {
        connected: hasEnv("SEMRUSH_API_KEY") || !!row.semrush_key,
        keyFallback: !!row.semrush_key && !hasEnv("SEMRUSH_API_KEY"),
      },
      brevo: {
        connected: hasEnv("BREVO_API_KEY"),
        senderConfigured: !!row.sender_email,
      },
      dataforseo: { connected: !!(row.dataforseo_login && row.dataforseo_password) },
    };
  });

export const testConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ key: z.enum(["gsc", "semrush", "brevo", "dataforseo"]) }).parse(v),
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean; message: string; detail?: string; latencyMs: number }> => {
    await assertAdmin(context);
    const start = Date.now();
    const latency = () => Date.now() - start;
    try {
      if (data.key === "gsc") {
        const key = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
        if (!key) return { ok: false, message: "Google Search Console not connected", latencyMs: latency() };
        return { ok: true, message: "Search Console credentials present", latencyMs: latency() };
      }
      if (data.key === "semrush") {
        const { data: s } = await context.supabase
          .from("api_settings").select("semrush_key").eq("user_id", context.userId).maybeSingle();
        const key = process.env.SEMRUSH_API_KEY || (s as any)?.semrush_key;
        if (!key) return { ok: false, message: "No Semrush API key configured", latencyMs: latency() };
        const r = await fetch(`https://api.semrush.com/analytics/v1/?type=domain_ranks&key=${encodeURIComponent(key)}&domain=example.com&export_columns=Db,Dn`);
        const text = await r.text();
        if (!r.ok || text.startsWith("ERROR")) return { ok: false, message: "Semrush test failed", detail: text.slice(0, 200), latencyMs: latency() };
        return { ok: true, message: "Semrush API reachable", latencyMs: latency() };
      }
      if (data.key === "brevo") {
        const key = process.env.BREVO_API_KEY;
        if (!key) return { ok: false, message: "Brevo API key not set", latencyMs: latency() };
        const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key } });
        if (!r.ok) return { ok: false, message: "Brevo test failed", detail: (await r.text()).slice(0, 200), latencyMs: latency() };
        return { ok: true, message: "Brevo account reachable", latencyMs: latency() };
      }
      // dataforseo
      const { data: s } = await context.supabase
        .from("api_settings").select("dataforseo_login,dataforseo_password").eq("user_id", context.userId).maybeSingle();
      const login = (s as any)?.dataforseo_login as string | undefined;
      const pw = (s as any)?.dataforseo_password as string | undefined;
      if (!login || !pw) return { ok: false, message: "DataForSEO credentials not set", latencyMs: latency() };
      const auth = Buffer.from(`${login}:${pw}`).toString("base64");
      const r = await fetch("https://api.dataforseo.com/v3/appendix/user_data", { headers: { Authorization: `Basic ${auth}` } });
      if (!r.ok) return { ok: false, message: "DataForSEO test failed", detail: (await r.text()).slice(0, 200), latencyMs: latency() };
      return { ok: true, message: "DataForSEO reachable", latencyMs: latency() };
    } catch (e) {
      return { ok: false, message: "Test failed", detail: e instanceof Error ? e.message : String(e), latencyMs: latency() };
    }
  });