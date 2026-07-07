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

export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  company: string | null;
  website: string | null;
  updated_at: string;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileRow> => {
    const cols = "user_id,display_name,avatar_url,bio,company,website,updated_at";

    // Try as the signed-in user first (respects RLS).
    const first = await context.supabase
      .from("profiles")
      .select(cols)
      .eq("user_id", context.userId)
      .maybeSingle();

    // If RBAC (has_role) is misconfigured, RLS policies that call it fail
    // with "permission denied for function has_role". Fall back to the admin
    // client scoped strictly to the caller's own row so profile still renders.
    const isRbacError =
      first.error &&
      /permission denied|has_role/i.test(first.error.message ?? "");

    let row = first.data as ProfileRow | null;
    let usedAdminFallback = false;

    if (first.error && !isRbacError) {
      throw new Error(first.error.message);
    }

    if (isRbacError) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: adminRow, error: adminErr } = await supabaseAdmin
        .from("profiles")
        .select(cols)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (adminErr) throw new Error(adminErr.message);
      row = (adminRow as ProfileRow) ?? null;
      usedAdminFallback = true;
      console.warn("[getMyProfile] RLS/has_role permission error, used admin fallback:", first.error?.message);
    }

    if (row) return row;

    // No row yet — create one (scoped to the caller).
    const insertClient = usedAdminFallback
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : context.supabase;
    const { data: created, error: insErr } = await insertClient
      .from("profiles")
      .insert({ user_id: context.userId })
      .select(cols)
      .single();
    if (insErr) throw new Error(insErr.message);
    return created as ProfileRow;
  });

const profileFields = z.object({
  display_name: z.string().max(120).nullish(),
  avatar_url: z.string().url().max(2000).nullish().or(z.literal("")),
  bio: z.string().max(1000).nullish(),
  company: z.string().max(200).nullish(),
  website: z.string().url().max(500).nullish().or(z.literal("")),
});

function normalize(v: z.infer<typeof profileFields>) {
  const empty = (s: string | null | undefined): string | null =>
    typeof s === "string" && s.trim() === "" ? null : (s ?? null);
  return {
    display_name: empty(v.display_name),
    avatar_url: empty(v.avatar_url),
    bio: empty(v.bio),
    company: empty(v.company),
    website: empty(v.website),
  };
}

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(profileFields))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ user_id: context.userId, ...normalize(data) }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProfileByUserId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ userId: z.string().uuid() })))
  .handler(async ({ context, data }): Promise<ProfileRow | null> => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("profiles")
      .select("user_id,display_name,avatar_url,bio,company,website,updated_at")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as ProfileRow) ?? null;
  });

export const updateProfileAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(profileFields.extend({ userId: z.string().uuid() })))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { userId, ...fields } = data;
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ user_id: userId, ...normalize(fields) }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });