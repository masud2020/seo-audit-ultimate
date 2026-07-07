import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Table = "saved_links" | "saved_sheets";

const CreateSchema = z.object({
  table: z.enum(["saved_links", "saved_sheets"]),
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  notes: z.string().trim().max(2000).optional().nullable(),
});
const UpdateSchema = CreateSchema.partial({ name: true, url: true, notes: true }).extend({
  id: z.string().uuid(),
  table: z.enum(["saved_links", "saved_sheets"]),
});
const ListSchema = z.object({ table: z.enum(["saved_links", "saved_sheets"]) });
const DeleteSchema = z.object({ id: z.string().uuid(), table: z.enum(["saved_links", "saved_sheets"]) });

export interface SavedItem {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const listSavedItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: Table }) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from(data.table)
      .select("id,name,url,notes,created_at,updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SavedItem[];
  });

export const createSavedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: Table; name: string; url: string; notes?: string | null }) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from(data.table)
      .insert({ user_id: context.userId, name: data.name, url: data.url, notes: data.notes ?? null })
      .select("id,name,url,notes,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as SavedItem;
  });

export const updateSavedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; table: Table; name?: string; url?: string; notes?: string | null }) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.url !== undefined) patch.url = data.url;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await context.supabase
      .from(data.table)
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,name,url,notes,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as SavedItem;
  });

export const deleteSavedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; table: Table }) => DeleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from(data.table)
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });