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

export interface PricingPlan {
  id: string;
  slug: string;
  name: string;
  price_bdt: number;
  currency: string;
  description: string | null;
  features: string[];
  cta_label: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface BkashSettings {
  merchant_number: string | null;
  account_type: string;
  instructions: string | null;
}

export interface BkashPayment {
  id: string;
  user_id: string;
  plan_slug: string;
  transaction_id: string;
  sender_msisdn: string;
  amount_bdt: number;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_slug: string;
  status: "active" | "expired" | "canceled";
  started_at: string;
  expires_at: string | null;
  source: string;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

function normalizePlan(row: any): PricingPlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price_bdt: row.price_bdt,
    currency: row.currency,
    description: row.description,
    features: Array.isArray(row.features) ? (row.features as string[]) : [],
    cta_label: row.cta_label,
    is_featured: !!row.is_featured,
    is_active: !!row.is_active,
    sort_order: row.sort_order,
  };
}

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// ---------------- Public read ----------------

export const listPublicPlans = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ plans: PricingPlan[] }> => {
    const supa = await publicClient();
    const { data, error } = await supa
      .from("pricing_plans")
      .select("id,slug,name,price_bdt,currency,description,features,cta_label,is_featured,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: (data ?? []).map(normalizePlan) };
  });

export const getPublicBkashSettings = createServerFn({ method: "GET" })
  .handler(async (): Promise<BkashSettings> => {
    const supa = await publicClient();
    const { data } = await supa
      .from("bkash_settings")
      .select("merchant_number,account_type,instructions")
      .eq("id", 1)
      .maybeSingle();
    return (data as BkashSettings | null) ?? { merchant_number: null, account_type: "personal", instructions: null };
  });

// ---------------- User (authenticated) ----------------

export const submitBkashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({
    plan_slug: z.string().min(1),
    transaction_id: z.string().trim().min(4).max(50),
    sender_msisdn: z.string().trim().min(6).max(20),
  })))
  .handler(async ({ context, data }): Promise<{ ok: true; id: string }> => {
    const { data: plan, error: pErr } = await context.supabase
      .from("pricing_plans")
      .select("slug,price_bdt,is_active")
      .eq("slug", data.plan_slug)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plan || !plan.is_active) throw new Error("Plan not available");
    if ((plan as any).price_bdt <= 0) throw new Error("This plan is free — no payment needed");
    const { data: row, error } = await context.supabase
      .from("bkash_payments")
      .insert({
        user_id: context.userId,
        plan_slug: data.plan_slug,
        transaction_id: data.transaction_id.toUpperCase(),
        sender_msisdn: data.sender_msisdn,
        amount_bdt: (plan as any).price_bdt,
        status: "pending",
      })
      .select("id").single();
    if (error) throw new Error(error.message.includes("duplicate") ? "This transaction ID has already been submitted" : error.message);
    return { ok: true, id: (row as any).id };
  });

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ subscription: UserSubscription | null; payments: BkashPayment[] }> => {
    const [{ data: subRow }, { data: pays }] = await Promise.all([
      context.supabase
        .from("user_subscriptions")
        .select("id,user_id,plan_slug,status,started_at,expires_at,source")
        .eq("user_id", context.userId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("bkash_payments")
        .select("id,user_id,plan_slug,transaction_id,sender_msisdn,amount_bdt,status,admin_note,reviewed_by,reviewed_at,created_at,updated_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { subscription: (subRow as UserSubscription | null) ?? null, payments: (pays ?? []) as BkashPayment[] };
  });

// ---------------- Admin ----------------

export const listAllPlansAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ plans: PricingPlan[] }> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("pricing_plans")
      .select("id,slug,name,price_bdt,currency,description,features,cta_label,is_featured,is_active,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: (data ?? []).map(normalizePlan) };
  });

const planInput = z.object({
  id: z.string().uuid().nullish(),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only"),
  name: z.string().min(1).max(80),
  price_bdt: z.number().int().min(0).max(10_000_000),
  description: z.string().max(500).nullish(),
  features: z.array(z.string().min(1).max(200)).max(30),
  cta_label: z.string().min(1).max(40),
  is_featured: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
});

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(planInput))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const payload = { ...data, description: data.description ?? null };
    if (data.id) {
      const { error } = await context.supabase.from("pricing_plans").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _drop, ...ins } = payload;
      const { error } = await context.supabase.from("pricing_plans").insert(ins);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ id: z.string().uuid() })))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("pricing_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBkashSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BkashSettings> => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("bkash_settings")
      .select("merchant_number,account_type,instructions")
      .eq("id", 1)
      .maybeSingle();
    return (data as BkashSettings | null) ?? { merchant_number: null, account_type: "personal", instructions: null };
  });

export const updateBkashSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({
    merchant_number: z.string().trim().min(6).max(20),
    account_type: z.enum(["personal", "merchant", "agent"]),
    instructions: z.string().max(2000).nullish(),
  })))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("bkash_settings")
      .upsert({ id: 1, ...data, instructions: data.instructions ?? null }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface BkashPaymentWithEmail extends BkashPayment {
  user_email: string | null;
}

export const listAllPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") }).partial()))
  .handler(async ({ context, data }): Promise<{ payments: BkashPaymentWithEmail[] }> => {
    await assertAdmin(context);
    const status = data?.status ?? "pending";
    let q = context.supabase
      .from("bkash_payments")
      .select("id,user_id,plan_slug,transaction_id,sender_msisdn,amount_bdt,status,admin_note,reviewed_by,reviewed_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") q = q.eq("status", status);
    const { data: pays, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (pays ?? []) as BkashPayment[];
    // enrich with emails using admin client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emailByUser = new Map<string, string | null>();
    for (const uid of Array.from(new Set(rows.map((r) => r.user_id)))) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        emailByUser.set(uid, u.user?.email ?? null);
      } catch { emailByUser.set(uid, null); }
    }
    return { payments: rows.map((r) => ({ ...r, user_email: emailByUser.get(r.user_id) ?? null })) };
  });

export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    note: z.string().max(500).nullish(),
  })))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { data: pay, error: pErr } = await context.supabase
      .from("bkash_payments")
      .select("id,user_id,plan_slug,status,amount_bdt")
      .eq("id", data.id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pay) throw new Error("Payment not found");
    if ((pay as any).status !== "pending") throw new Error("Payment already reviewed");

    const newStatus = data.action === "approve" ? "approved" : "rejected";
    const { error: updErr } = await context.supabase
      .from("bkash_payments")
      .update({
        status: newStatus,
        admin_note: data.note ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    if (data.action === "approve") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // expire any existing active sub
      await supabaseAdmin
        .from("user_subscriptions")
        .update({ status: "expired" })
        .eq("user_id", (pay as any).user_id)
        .eq("status", "active");
      // one month from now
      const expires = new Date(); expires.setMonth(expires.getMonth() + 1);
      const { error: subErr } = await supabaseAdmin.from("user_subscriptions").insert({
        user_id: (pay as any).user_id,
        plan_slug: (pay as any).plan_slug,
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: expires.toISOString(),
        source: "bkash",
        source_payment_id: data.id,
      });
      if (subErr) throw new Error(subErr.message);
    }
    return { ok: true };
  });