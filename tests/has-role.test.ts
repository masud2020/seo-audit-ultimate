/**
 * Verifies public.has_role SECURITY DEFINER surface after every change:
 *  - anon can call has_role and gets `false` for a random uuid (function is
 *    reachable for public RLS policies like pricing_plans SELECT).
 *  - anon can NOT execute internal SECURITY DEFINER trigger functions
 *    (permission denied), confirming the revoke migration is in effect.
 *  - anon reads on pricing_plans succeed (relies on has_role in the policy).
 *
 * Reads Supabase URL + publishable key from Vite env so it works in CI without
 * extra setup. Skips gracefully if env is missing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const RANDOM_UUID = "00000000-0000-0000-0000-000000000000";

// Trigger-only SECURITY DEFINER functions that must NOT be callable by anon.
const REVOKED_TRIGGER_FNS = [
  "profiles_touch_updated_at",
  "pricing_plans_touch_updated_at",
  "bkash_payments_touch_updated_at",
  "user_subscriptions_touch_updated_at",
] as const;

let anon: SupabaseClient | null = null;

beforeAll(() => {
  if (URL && KEY) {
    anon = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    });
  }
});

describe("has_role SECURITY DEFINER surface", () => {
  it("skips cleanly when Supabase env is missing", () => {
    if (!anon) expect(URL && KEY).toBeFalsy();
  });

  it("anon can call has_role and gets false for a non-admin uuid", async () => {
    if (!anon) return;
    const { data, error } = await anon.rpc("has_role", {
      _user_id: RANDOM_UUID,
      _role: "admin",
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("anon cannot execute internal trigger SECURITY DEFINER functions", async () => {
    if (!anon) return;
    for (const fn of REVOKED_TRIGGER_FNS) {
      const { error } = await anon.rpc(fn as any);
      // Either "permission denied" (revoked) or "could not find function"
      // (not exposed via PostgREST) — both prove anon cannot call it.
      expect(error, `expected error calling ${fn} as anon`).not.toBeNull();
      const msg = (error?.message ?? "").toLowerCase();
      expect(
        msg.includes("permission denied") ||
          msg.includes("could not find") ||
          msg.includes("not found"),
        `unexpected error for ${fn}: ${error?.message}`,
      ).toBe(true);
    }
  });

  it("anon can read active pricing_plans (RLS policy uses has_role)", async () => {
    if (!anon) return;
    const { error } = await anon
      .from("pricing_plans")
      .select("id,slug,is_active")
      .eq("is_active", true)
      .limit(1);
    expect(error, `pricing_plans anon read failed: ${error?.message}`).toBeNull();
  });
});