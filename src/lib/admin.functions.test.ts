import { describe, it, expect, vi } from "vitest";
import { assertAdmin } from "./admin.functions";

function mockCtx(hasRole: boolean, opts?: { rpcError?: string }) {
  const rpc = vi.fn(async (fn: string, args: { _user_id: string; _role: string }) => {
    expect(fn).toBe("has_role");
    expect(args._role).toBe("admin");
    if (opts?.rpcError) return { data: null, error: { message: opts.rpcError } };
    return { data: hasRole, error: null };
  });
  return { supabase: { rpc }, userId: "00000000-0000-0000-0000-000000000001" };
}

describe("assertAdmin (server-side admin guard)", () => {
  it("resolves silently when has_role returns true", async () => {
    await expect(assertAdmin(mockCtx(true))).resolves.toBeUndefined();
  });

  it("rejects with 'Forbidden' when has_role returns false", async () => {
    await expect(assertAdmin(mockCtx(false))).rejects.toThrow(/Forbidden/i);
  });

  it("rejects when has_role returns null (no role row)", async () => {
    const ctx = { supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) }, userId: "u" };
    await expect(assertAdmin(ctx)).rejects.toThrow(/Forbidden/i);
  });

  it("propagates database errors from has_role", async () => {
    await expect(assertAdmin(mockCtx(false, { rpcError: "db down" }))).rejects.toThrow("db down");
  });

  it("always queries has_role with role='admin'", async () => {
    const ctx = mockCtx(true);
    await assertAdmin(ctx);
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
  });
});