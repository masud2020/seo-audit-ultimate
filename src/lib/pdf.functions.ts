import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export const generateAuditPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audit_id: string }) => z.object({ audit_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("audits").select("*").eq("id", data.audit_id).single();
    if (error || !row) throw new Error(error?.message ?? "Audit not found");
    if (row.status !== "complete") throw new Error("Audit is not complete yet.");
    const { buildAuditPdf } = await import("./pdf.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = await buildAuditPdf(row.sections as any, (row.ai_recommendations ?? []) as any);
    return { base64: toBase64(pdf), filename: `audit-${row.url.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.pdf` };
  });

export const generateCrawlPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { crawl_id: string }) => z.object({ crawl_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("site_crawls").select("*").eq("id", data.crawl_id).single();
    if (error || !row) throw new Error(error?.message ?? "Crawl not found");
    const { buildCrawlPdf } = await import("./pdf.server");
    const pdf = await buildCrawlPdf({
      start_url: row.start_url,
      pages_crawled: row.pages_crawled ?? 0,
      created_at: row.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: (row.pages ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      issues: (row.issues ?? []) as any,
    });
    return { base64: toBase64(pdf), filename: `crawl-${row.start_url.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.pdf` };
  });

// Send audit PDF via Brevo (connector gateway). Requires BREVO_API_KEY (connector connected)
// and sender_email/sender_name saved in api_settings.
export const emailAuditPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audit_id: string; to: string; note?: string }) =>
    z.object({ audit_id: z.string().uuid(), to: z.string().email(), note: z.string().max(2000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const brevoKey = process.env.BREVO_API_KEY;
    if (!lovableKey) throw new Error("Lovable API key not configured.");
    if (!brevoKey) throw new Error("Brevo is not connected. Connect Brevo in Workspace Connectors to enable email delivery.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (context.supabase as any).from("api_settings").select("sender_email,sender_name").eq("user_id", context.userId).maybeSingle();
    const senderEmail = (settings as { sender_email?: string } | null)?.sender_email;
    const senderName = (settings as { sender_name?: string } | null)?.sender_name || "SEO Audit Tool";
    if (!senderEmail) throw new Error("Set a verified sender email in Settings before sending reports.");

    const { data: row, error } = await context.supabase.from("audits").select("*").eq("id", data.audit_id).single();
    if (error || !row) throw new Error(error?.message ?? "Audit not found");
    if (row.status !== "complete") throw new Error("Audit is not complete yet.");

    const { buildAuditPdf } = await import("./pdf.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = await buildAuditPdf(row.sections as any, (row.ai_recommendations ?? []) as any);
    const base64 = toBase64(pdf);

    const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#222">
      <h2 style="margin:0 0 8px">Your SEO audit report is ready</h2>
      <p style="margin:0 0 12px">URL: <b>${row.url}</b><br/>Overall score: <b>${row.overall_score ?? "n/a"}/100</b></p>
      ${data.note ? `<p style="margin:12px 0;padding:10px;background:#f5f5f5;border-radius:6px">${data.note.replace(/</g, "&lt;")}</p>` : ""}
      <p style="margin:16px 0 0;color:#666;font-size:12px">Full report attached as PDF.</p>
    </div>`;

    const r = await fetch("https://connector-gateway.lovable.dev/brevo/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": brevoKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: data.to }],
        subject: `SEO Audit: ${row.url}`,
        htmlContent: html,
        attachment: [{ name: `audit-${row.url.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.pdf`, content: base64 }],
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error(`Brevo error [${r.status}]: ${body}`);
      throw new Error(`Email failed [${r.status}]: ${body.slice(0, 300)}`);
    }
    return { ok: true };
  });