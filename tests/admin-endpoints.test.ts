/**
 * Integration test: verifies every admin-only server function endpoint
 * rejects unauthenticated requests, and that /admin (client-gated) never
 * returns sensitive server data in its SSR shell.
 *
 * Requires the dev server running at http://localhost:8080. In CI, start it
 * with `bun run dev &` then wait for readiness before invoking vitest.
 *
 * Skipped automatically if the dev server is not reachable.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:8080";

// Server-function endpoints are addressed by `_serverFnId` in the request.
// The routing filename+export uniquely identifies each handler.
const ADMIN_ENDPOINTS = [
  "listAllUsers_createServerFn_handler",
  "setUserAdmin_createServerFn_handler",
  "deleteUserAccount_createServerFn_handler",
  "sendPasswordResetForUser_createServerFn_handler",
  "toggleUserBan_createServerFn_handler",
  "getConnectorStatus_createServerFn_handler",
  "testConnector_createServerFn_handler",
] as const;

let serverUp = false;

beforeAll(async () => {
  try {
    const r = await fetch(BASE, { method: "GET" });
    serverUp = r.status < 600;
  } catch {
    serverUp = false;
  }
});

async function callServerFn(exportName: string, body: unknown) {
  const url = new URL("/_serverFn/x", BASE);
  url.searchParams.set("_serverFnId", `src/lib/admin.functions.ts?tss-serverfn-split#${exportName}`);
  return fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin endpoints reject unauthenticated callers", () => {
  for (const name of ADMIN_ENDPOINTS) {
    it(`${name} → unauthorized / forbidden`, async () => {
      if (!serverUp) return; // skip when dev server not running
      const res = await callServerFn(name, { data: {} });
      // requireSupabaseAuth returns 401 with body containing "Unauthorized";
      // assertAdmin (post-auth) throws "Forbidden". Either is acceptable
      // for an unauthenticated request — never 200.
      expect(res.status).not.toBe(200);
      const text = await res.text();
      expect(text).toMatch(/unauthorized|forbidden|no authorization/i);
    });
  }
});

describe("/admin route shell is not a data leak", () => {
  it("SSR HTML for /admin contains no user list payload", async () => {
    if (!serverUp) return;
    const res = await fetch(`${BASE}/admin`);
    const html = await res.text();
    // _authenticated layout is ssr:false, so the shell must not embed users.
    expect(html).not.toMatch(/"users"\s*:\s*\[/);
    expect(html).not.toMatch(/is_admin/);
  });
});