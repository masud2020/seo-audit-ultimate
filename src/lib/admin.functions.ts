import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  });

export const getConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: s } = await context.supabase
      .from("api_settings")
      .select("dataforseo_login, dataforseo_password, semrush_key, sender_email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const dataforseoConfigured = !!(s?.dataforseo_login && s?.dataforseo_password);

    return {
      gsc: {
        connected: !!process.env.GOOGLE_SEARCH_CONSOLE_API_KEY,
        envVar: "GOOGLE_SEARCH_CONSOLE_API_KEY",
      },
      semrush: {
        connected: !!process.env.SEMRUSH_API_KEY,
        envVar: "SEMRUSH_API_KEY",
        keyFallback: !!s?.semrush_key,
      },
      brevo: {
        connected: !!process.env.BREVO_API_KEY,
        envVar: "BREVO_API_KEY",
        senderConfigured: !!s?.sender_email,
      },
      dataforseo: {
        connected: dataforseoConfigured,
        envVar: null,
      },
    };
  });