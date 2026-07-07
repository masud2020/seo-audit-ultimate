import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Auto-approve a pending bKash payment by matching Transaction ID (and optional
 * amount / msisdn). Idempotent: safe to call multiple times for the same TrxID.
 * Returns the outcome so callers (webhook / poller) can log it.
 */
export async function autoApproveByTrxId(params: {
  trxId: string;
  amount?: number | null;
  senderMsisdn?: string | null;
  source: "webhook" | "poller" | "manual-match";
}): Promise<
  | { ok: true; status: "activated"; paymentId: string; userId: string; planSlug: string }
  | { ok: true; status: "already_processed"; paymentId: string }
  | { ok: false; reason: "not_found" | "amount_mismatch" }
> {
  const trx = params.trxId.trim().toUpperCase();

  const { data: pay, error } = await supabaseAdmin
    .from("bkash_payments")
    .select("id,user_id,plan_slug,status,amount_bdt,sender_msisdn")
    .ilike("transaction_id", trx)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pay) return { ok: false, reason: "not_found" };

  if (pay.status !== "pending") {
    return { ok: true, status: "already_processed", paymentId: pay.id };
  }

  if (
    typeof params.amount === "number" &&
    Math.round(params.amount) !== Math.round(pay.amount_bdt)
  ) {
    await supabaseAdmin
      .from("bkash_payments")
      .update({
        admin_note: `Auto-verify (${params.source}) amount mismatch: reported ${params.amount} vs expected ${pay.amount_bdt}`,
      })
      .eq("id", pay.id);
    return { ok: false, reason: "amount_mismatch" };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("bkash_payments")
    .update({
      status: "approved",
      admin_note: `Auto-approved via ${params.source}`,
      reviewed_at: nowIso,
    })
    .eq("id", pay.id)
    .eq("status", "pending");
  if (updErr) throw new Error(updErr.message);

  // expire any active sub, then insert new one (30 days)
  await supabaseAdmin
    .from("user_subscriptions")
    .update({ status: "expired" })
    .eq("user_id", pay.user_id)
    .eq("status", "active");

  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);
  const { error: subErr } = await supabaseAdmin.from("user_subscriptions").insert({
    user_id: pay.user_id,
    plan_slug: pay.plan_slug,
    status: "active",
    started_at: nowIso,
    expires_at: expires.toISOString(),
    source: "bkash",
    source_payment_id: pay.id,
  });
  if (subErr) throw new Error(subErr.message);

  return {
    ok: true,
    status: "activated",
    paymentId: pay.id,
    userId: pay.user_id,
    planSlug: pay.plan_slug,
  };
}