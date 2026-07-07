import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function validate<T extends z.ZodTypeAny>(schema: T) {
  return (v: unknown): z.infer<T> => {
    const parsed = schema.safeParse(v);
    if (!parsed.success) {
      throw new Response(JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    return parsed.data;
  };
}

export interface ApprovalStatus {
  status: "pending" | "approved" | "rejected";
  approved_until: string | null;
  approval_note: string | null;
  is_admin: boolean;
  is_active: boolean;
  expired: boolean;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const getMyApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApprovalStatus> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("approval_status,approved_until,approval_note")
      .eq("user_id", context.userId)
      .maybeSingle();
    const r = (row ?? {}) as { approval_status?: string; approved_until?: string | null; approval_note?: string | null };
    const status = (r.approval_status as ApprovalStatus["status"]) ?? "pending";
    const approved_until = r.approved_until ?? null;
    const expired = status === "approved" && !!approved_until && new Date(approved_until).getTime() <= Date.now();
    const is_active = !!isAdmin || (status === "approved" && !expired);
    return {
      status,
      approved_until,
      approval_note: r.approval_note ?? null,
      is_admin: !!isAdmin,
      is_active,
      expired,
    };
  });

const setInput = z.object({
  userId: z.string().uuid(),
  action: z.enum(["approve", "reject", "revoke", "extend"]),
  months: z.number().int().min(1).max(120).default(1),
  note: z.string().max(500).nullish(),
});

export const setUserApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(setInput))
  .handler(async ({ context, data }): Promise<{ ok: true; approved_until: string | null }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure a profile row exists.
    await supabaseAdmin.from("profiles").upsert({ user_id: data.userId }, { onConflict: "user_id" });

    let patch: Record<string, unknown> = {};
    if (data.action === "approve" || data.action === "extend") {
      // Extend from current approved_until if still in the future, else from now.
      const { data: row } = await supabaseAdmin
        .from("profiles").select("approved_until").eq("user_id", data.userId).maybeSingle();
      const cur = (row as { approved_until?: string | null } | null)?.approved_until;
      const base = cur && new Date(cur).getTime() > Date.now() && data.action === "extend"
        ? new Date(cur) : new Date();
      base.setMonth(base.getMonth() + data.months);
      patch = {
        approval_status: "approved",
        approved_until: base.toISOString(),
        approved_by: context.userId,
        approval_note: data.note ?? null,
      };
    } else if (data.action === "reject") {
      patch = {
        approval_status: "rejected",
        approved_until: null,
        approved_by: context.userId,
        approval_note: data.note ?? null,
      };
    } else {
      // revoke → back to pending
      patch = {
        approval_status: "pending",
        approved_until: null,
        approved_by: context.userId,
        approval_note: data.note ?? null,
      };
    }

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, approved_until: (patch.approved_until as string | null) ?? null };
  });

export interface ApprovalListItem {
  user_id: string;
  email: string | null;
  status: "pending" | "approved" | "rejected";
  approved_until: string | null;
  approval_note: string | null;
  is_admin: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  effective_active: boolean;
  expired: boolean;
}

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: ApprovalListItem[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id,approval_status,approved_until,approval_note,display_name")
      .order("approved_until", { ascending: true, nullsFirst: true });
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id,role").eq("role", "admin");
    const adminSet = new Set((roles ?? []).map((r: any) => r.user_id));

    // Best-effort enrichment with auth.users (email, timestamps)
    const emailByUser = new Map<string, { email: string | null; created_at: string | null; last_sign_in_at: string | null }>();
    try {
      let page = 1;
      while (page <= 10) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) break;
        const batch = data?.users ?? [];
        for (const u of batch) {
          emailByUser.set(u.id, {
            email: u.email ?? null,
            created_at: u.created_at ?? null,
            last_sign_in_at: (u as any).last_sign_in_at ?? null,
          });
        }
        if (batch.length < 100) break;
        page++;
      }
    } catch { /* ignore */ }

    const now = Date.now();
    const items: ApprovalListItem[] = ((profs ?? []) as any[]).map((p) => {
      const status = (p.approval_status ?? "pending") as ApprovalListItem["status"];
      const approved_until = p.approved_until ?? null;
      const expired = status === "approved" && !!approved_until && new Date(approved_until).getTime() <= now;
      const meta = emailByUser.get(p.user_id);
      const is_admin = adminSet.has(p.user_id);
      return {
        user_id: p.user_id,
        email: meta?.email ?? p.display_name ?? null,
        status,
        approved_until,
        approval_note: p.approval_note ?? null,
        is_admin,
        created_at: meta?.created_at ?? null,
        last_sign_in_at: meta?.last_sign_in_at ?? null,
        effective_active: is_admin || (status === "approved" && !expired),
        expired,
      };
    });
    // Order: pending → expired → approved (soonest first) → rejected
    const rank = (i: ApprovalListItem) =>
      i.status === "pending" ? 0 : i.expired ? 1 : i.status === "approved" ? 2 : 3;
    items.sort((a, b) => rank(a) - rank(b));
    return { items };
  });