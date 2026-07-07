import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * bKash payment webhook (also usable as a generic auto-approve callback).
 *
 * Auth options (either works):
 *   1. Header `x-webhook-secret: <BKASH_WEBHOOK_SECRET>` (simple shared secret)
 *   2. Header `x-webhook-signature: <hex hmac-sha256(rawBody, BKASH_WEBHOOK_SECRET)>`
 *
 * Expected JSON body (flexible — we look for the TrxID in common bKash field names):
 *   { "trxID": "ABC123XYZ", "amount": 1500, "sender": "01XXXXXXXXX", "status": "Completed" }
 *
 * Behaviour: looks up a pending bkash_payments row by transaction_id,
 * validates the amount, marks it approved and activates a 30-day subscription.
 */

const bodySchema = z
  .object({
    trxID: z.string().optional(),
    trxId: z.string().optional(),
    transactionId: z.string().optional(),
    transaction_id: z.string().optional(),
    paymentID: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    sender: z.string().optional(),
    customerMsisdn: z.string().optional(),
    payerReference: z.string().optional(),
    status: z.string().optional(),
    transactionStatus: z.string().optional(),
  })
  .passthrough();

function pickTrxId(b: z.infer<typeof bodySchema>): string | null {
  return (
    b.trxID ||
    b.trxId ||
    b.transactionId ||
    b.transaction_id ||
    b.paymentID ||
    null
  );
}

function pickAmount(b: z.infer<typeof bodySchema>): number | null {
  if (b.amount == null) return null;
  const n = typeof b.amount === "number" ? b.amount : Number(b.amount);
  return Number.isFinite(n) ? n : null;
}

function pickMsisdn(b: z.infer<typeof bodySchema>): string | null {
  return b.sender || b.customerMsisdn || b.payerReference || null;
}

function isSuccessStatus(b: z.infer<typeof bodySchema>): boolean {
  const s = (b.status || b.transactionStatus || "").toLowerCase();
  // if the payload omits status entirely, assume success (many notifiers do)
  if (!s) return true;
  return ["completed", "success", "successful", "paid", "approved"].includes(s);
}

function verifyAuth(request: Request, rawBody: string): boolean {
  const secret = process.env.BKASH_WEBHOOK_SECRET;
  if (!secret) return false;

  const plain = request.headers.get("x-webhook-secret");
  if (plain) {
    const a = Buffer.from(plain);
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }

  const sig = request.headers.get("x-webhook-signature");
  if (sig) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export const Route = createFileRoute("/api/public/hooks/bkash-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        if (!verifyAuth(request, rawBody)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let json: unknown;
        try {
          json = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid_body" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const body = parsed.data;

        const trxId = pickTrxId(body);
        if (!trxId) {
          return new Response(JSON.stringify({ error: "missing_trx_id" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!isSuccessStatus(body)) {
          return Response.json({ ok: true, ignored: "non_success_status" });
        }

        const { autoApproveByTrxId } = await import("@/lib/bkash-approve.server");
        try {
          const result = await autoApproveByTrxId({
            trxId,
            amount: pickAmount(body),
            senderMsisdn: pickMsisdn(body),
            source: "webhook",
          });
          return Response.json(result);
        } catch (e) {
          console.error("[bkash-webhook] error", e);
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});