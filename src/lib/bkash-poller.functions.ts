import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/**
 * Manually run the auto-approver for a single TrxID from the admin panel.
 * Useful when a webhook was missed or when reconciling manually.
 */
export const autoApproveTrx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ trxId: z.string().trim().min(4).max(64) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { autoApproveByTrxId } = await import("./bkash-approve.server");
    return autoApproveByTrxId({ trxId: data.trxId, source: "manual-match" });
  });

/**
 * Poll bKash Query API for every pending payment and auto-approve verified ones.
 * Requires BKASH_APP_KEY / BKASH_APP_SECRET / BKASH_USERNAME / BKASH_PASSWORD
 * and optionally BKASH_BASE_URL (defaults to sandbox). Without those secrets
 * this fn returns { configured: false } so the admin knows to add them.
 */
export const pollPendingPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const appKey = process.env.BKASH_APP_KEY;
    const appSecret = process.env.BKASH_APP_SECRET;
    const username = process.env.BKASH_USERNAME;
    const password = process.env.BKASH_PASSWORD;
    const baseUrl =
      process.env.BKASH_BASE_URL ||
      "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

    if (!appKey || !appSecret || !username || !password) {
      return {
        configured: false as const,
        message:
          "bKash PGW credentials not set. Add BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD (and optionally BKASH_BASE_URL) to enable status polling.",
      };
    }

    // 1) Grant token
    let token = "";
    try {
      const tRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          username,
          password,
        },
        body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
      });
      const tJson = (await tRes.json()) as { id_token?: string; statusMessage?: string };
      if (!tJson.id_token) {
        return {
          configured: true as const,
          ok: false as const,
          error: `token_grant_failed: ${tJson.statusMessage ?? tRes.status}`,
        };
      }
      token = tJson.id_token;
    } catch (e) {
      return { configured: true as const, ok: false as const, error: `token_grant_error: ${(e as Error).message}` };
    }

    // 2) Load pending payments
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pendings, error } = await supabaseAdmin
      .from("bkash_payments")
      .select("id,transaction_id,amount_bdt")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const { autoApproveByTrxId } = await import("./bkash-approve.server");
    const results: Array<{ trxId: string; outcome: string }> = [];

    for (const p of pendings ?? []) {
      try {
        const qRes = await fetch(`${baseUrl}/tokenized/checkout/general/searchTransaction`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: token,
            "x-app-key": appKey,
          },
          body: JSON.stringify({ trxID: p.transaction_id }),
        });
        const q = (await qRes.json()) as {
          transactionStatus?: string;
          amount?: string;
          customerMsisdn?: string;
          statusCode?: string;
        };
        if (q.transactionStatus && q.transactionStatus.toLowerCase() === "completed") {
          const r = await autoApproveByTrxId({
            trxId: p.transaction_id,
            amount: q.amount ? Number(q.amount) : null,
            senderMsisdn: q.customerMsisdn ?? null,
            source: "poller",
          });
          results.push({
            trxId: p.transaction_id,
            outcome: "ok" in r && r.ok ? ("status" in r ? r.status : "ok") : `failed:${(r as any).reason}`,
          });
        } else {
          results.push({
            trxId: p.transaction_id,
            outcome: `bkash_status:${q.transactionStatus ?? q.statusCode ?? "unknown"}`,
          });
        }
      } catch (e) {
        results.push({ trxId: p.transaction_id, outcome: `error:${(e as Error).message}` });
      }
    }

    return { configured: true as const, ok: true as const, checked: results.length, results };
  });