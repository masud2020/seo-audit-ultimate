import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Palette, RotateCcw } from "lucide-react";
import {
  listNotificationPrefs,
  saveNotificationPrefs,
  TOOL_LABELS,
  TOOL_KEYS,
  type PrefRow,
  type ToolKey,
} from "@/lib/notifications.functions";
import { getBrand, saveBrand, type BrandSettings } from "@/lib/brand.functions";

export const Route = createFileRoute("/_authenticated/preferences")({ component: PreferencesPage });

function PreferencesPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Preferences & Branding</h1>
        <p className="text-sm text-muted-foreground">Choose when to be notified about tool runs and customize how the app looks for you.</p>
      </div>
      <Tabs defaultValue="notifications">
        <TabsList>
          <TabsTrigger value="notifications"><Bell className="mr-1 h-4 w-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="branding"><Palette className="mr-1 h-4 w-4" /> Branding</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications" className="mt-4"><NotificationPrefsCard /></TabsContent>
        <TabsContent value="branding" className="mt-4"><BrandingCard /></TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationPrefsCard() {
  const list = useServerFn(listNotificationPrefs);
  const save = useServerFn(saveNotificationPrefs);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["notification-prefs"], queryFn: () => list() });
  const [rows, setRows] = useState<PrefRow[]>([]);
  useEffect(() => { if (data?.prefs) setRows(data.prefs); }, [data]);

  const set = (tool: ToolKey, patch: Partial<PrefRow>) =>
    setRows((cur) => cur.map((r) => (r.tool === tool ? { ...r, ...patch } : r)));

  const m = useMutation({
    mutationFn: () => save({ data: { prefs: rows } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notification-prefs"] }); toast.success("Preferences saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">In-app notifications</h2>
        <p className="text-sm text-muted-foreground">
          Pick which tools notify you and whether you want to be pinged on success, error, or both. New notifications appear in the bell
          at the top of every page.
        </p>
      </div>
      <Separator />
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-2">
          <div className="hidden md:grid grid-cols-[1fr_100px_120px_120px] gap-3 text-xs uppercase tracking-wide text-muted-foreground px-2">
            <div>Tool</div><div>In-app</div><div>On success</div><div>On error</div>
          </div>
          {TOOL_KEYS.map((tool) => {
            const row = rows.find((r) => r.tool === tool) ?? { tool, in_app: true, notify_success: false, notify_error: true };
            return (
              <div key={tool} className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_120px] gap-3 items-center rounded-md border p-3">
                <div>
                  <div className="font-medium text-sm">{TOOL_LABELS[tool]}</div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={row.in_app} onCheckedChange={(v) => set(tool, { in_app: v })} /><span className="text-xs text-muted-foreground md:hidden">In-app</span></div>
                <div className="flex items-center gap-2"><Switch checked={row.notify_success} onCheckedChange={(v) => set(tool, { notify_success: v })} /><span className="text-xs text-muted-foreground md:hidden">Success</span></div>
                <div className="flex items-center gap-2"><Switch checked={row.notify_error} onCheckedChange={(v) => set(tool, { notify_error: v })} /><span className="text-xs text-muted-foreground md:hidden">Error</span></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={() => m.mutate()} disabled={m.isPending || isLoading}>{m.isPending ? "Saving…" : "Save preferences"}</Button>
      </div>
    </Card>
  );
}

const emptyForm = {
  app_name: "", logo_url: "", favicon_url: "",
  primary_color: "", accent_color: "",
  support_email: "", company_address: "",
  privacy_url: "", terms_url: "", footer_text: "",
};

function BrandingCard() {
  const get = useServerFn(getBrand);
  const save = useServerFn(saveBrand);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["brand"], queryFn: () => get() });
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  useEffect(() => {
    if (data) setForm({
      app_name: data.app_name ?? "", logo_url: data.logo_url ?? "", favicon_url: data.favicon_url ?? "",
      primary_color: data.primary_color ?? "", accent_color: data.accent_color ?? "",
      support_email: data.support_email ?? "", company_address: data.company_address ?? "",
      privacy_url: data.privacy_url ?? "", terms_url: data.terms_url ?? "", footer_text: data.footer_text ?? "",
    });
  }, [data]);
  const upd = <K extends keyof typeof emptyForm>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toPayload = (): Partial<BrandSettings> => {
    const out: Record<string, string | null> = {};
    (Object.keys(form) as (keyof typeof emptyForm)[]).forEach((k) => {
      const v = form[k]?.trim();
      out[k] = v ? v : null;
    });
    return out as Partial<BrandSettings>;
  };

  const m = useMutation({
    mutationFn: () => save({ data: toPayload() as never }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand"] }); toast.success("Branding updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const reset = useMutation({
    mutationFn: () => save({ data: {
      app_name: null, logo_url: null, favicon_url: null,
      primary_color: null, accent_color: null,
      support_email: null, company_address: null,
      privacy_url: null, terms_url: null, footer_text: null,
    } as never }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand"] }); setForm(emptyForm); toast.success("Reset to defaults"); },
  });

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Brand identity</h2>
          <p className="text-sm text-muted-foreground">Personalize the app name, logo, and colors. Applied instantly across the app for your account.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>App name</Label><Input value={form.app_name} onChange={(e) => upd("app_name", e.target.value)} placeholder="SEO Audit" /></div>
          <div><Label>Logo URL</Label><Input value={form.logo_url} onChange={(e) => upd("logo_url", e.target.value)} placeholder="https://…/logo.png" /></div>
          <div><Label>Favicon URL</Label><Input value={form.favicon_url} onChange={(e) => upd("favicon_url", e.target.value)} placeholder="https://…/favicon.ico" /></div>
          <div className="grid grid-cols-[1fr_44px] gap-2 items-end">
            <div><Label>Primary color (hex)</Label><Input value={form.primary_color} onChange={(e) => upd("primary_color", e.target.value)} placeholder="#3b82f6" /></div>
            <input type="color" aria-label="Pick primary color" value={form.primary_color || "#3b82f6"} onChange={(e) => upd("primary_color", e.target.value)} className="h-10 w-11 rounded border bg-background" />
          </div>
          <div className="grid grid-cols-[1fr_44px] gap-2 items-end">
            <div><Label>Accent color (hex)</Label><Input value={form.accent_color} onChange={(e) => upd("accent_color", e.target.value)} placeholder="#9333ea" /></div>
            <input type="color" aria-label="Pick accent color" value={form.accent_color || "#9333ea"} onChange={(e) => upd("accent_color", e.target.value)} className="h-10 w-11 rounded border bg-background" />
          </div>
        </div>
        <BrandPreview form={form} />
        <PdfPreview form={form} />
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Contact & legal</h2>
          <p className="text-sm text-muted-foreground">Shown in report footers and email templates.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>Support email</Label><Input type="email" value={form.support_email} onChange={(e) => upd("support_email", e.target.value)} placeholder="support@yourbrand.com" /></div>
          <div><Label>Privacy policy URL</Label><Input value={form.privacy_url} onChange={(e) => upd("privacy_url", e.target.value)} placeholder="https://yourbrand.com/privacy" /></div>
          <div><Label>Terms URL</Label><Input value={form.terms_url} onChange={(e) => upd("terms_url", e.target.value)} placeholder="https://yourbrand.com/terms" /></div>
          <div className="md:col-span-2"><Label>Company address</Label><Textarea rows={2} value={form.company_address} onChange={(e) => upd("company_address", e.target.value)} placeholder="123 Main St, City, Country" /></div>
          <div className="md:col-span-2"><Label>Footer text</Label><Textarea rows={2} value={form.footer_text} onChange={(e) => upd("footer_text", e.target.value)} placeholder="© 2026 Your Brand — All rights reserved." /></div>
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}><RotateCcw className="mr-1 h-4 w-4" />Reset to defaults</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save branding"}</Button>
        </div>
      </Card>
    </div>
  );
}

function BrandPreview({ form }: { form: typeof emptyForm }) {
  const primary = form.primary_color || "#3b82f6";
  const accent = form.accent_color || "#9333ea";
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Preview</div>
      <div className="flex items-center gap-3">
        {form.logo_url ? (
          <img src={form.logo_url} alt="" className="h-8 w-8 rounded object-cover" />
        ) : (
          <div className="h-8 w-8 rounded" style={{ background: primary }} />
        )}
        <div>
          <div className="text-sm font-semibold">{form.app_name || "SEO Audit"}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-block h-4 w-4 rounded-full border" style={{ background: primary }} title="Primary" />
            <span className="inline-block h-4 w-4 rounded-full border" style={{ background: accent }} title="Accent" />
            <button className="ml-2 rounded-md px-2 py-1 text-xs font-medium text-white" style={{ background: primary }}>Primary button</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfPreview({ form }: { form: typeof emptyForm }) {
  const primary = form.primary_color || "#3b82f6";
  const accent = form.accent_color || "#9333ea";
  const appName = form.app_name || "SEO Audit";
  const generatedAt = new Date().toLocaleDateString();
  const footerLeft = `Generated ${generatedAt} by ${appName}${form.footer_text ? " · " + form.footer_text : ""}`;
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">PDF report preview</div>
        <div className="text-[10px] text-muted-foreground">Cover &amp; footer</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cover mock */}
        <div className="rounded-md border bg-white shadow-sm overflow-hidden aspect-[8.5/11] flex flex-col">
          <div className="relative" style={{ background: primary, height: "18%" }}>
            <div className="absolute inset-x-0 bottom-0" style={{ background: accent, height: 3 }} />
            <div className="p-3 flex items-center gap-2 h-full">
              {form.logo_url ? (
                <img src={form.logo_url} alt="" className="h-6 w-6 rounded object-cover bg-white/20" />
              ) : (
                <div className="h-6 w-6 rounded bg-white/30" />
              )}
              <div className="text-white text-[11px] font-semibold truncate">{appName}</div>
              <div className="ml-auto text-white/80 text-[9px]">SEO Audit Report</div>
            </div>
          </div>
          <div className="p-3 flex-1 flex flex-col gap-2">
            <div className="text-[10px] text-gray-500">example.com</div>
            <div className="text-[13px] font-semibold text-gray-900 leading-tight">Website SEO Audit</div>
            <div className="mt-1 rounded-md border p-2 flex items-center gap-2">
              <div
                className="h-10 w-10 rounded-full grid place-items-center text-white text-xs font-bold"
                style={{ background: primary }}
              >
                82
              </div>
              <div className="flex-1">
                <div className="text-[9px] uppercase tracking-wide text-gray-500">Overall score</div>
                <div className="text-[10px] text-gray-700">Good — minor issues</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-1">
              {[
                ["PASS", "#16a34a"],
                ["WARN", "#eab308"],
                ["FAIL", "#dc2626"],
                ["INFO", "#7c3aed"],
              ].map(([label, c]) => (
                <div key={label} className="rounded border p-1 text-center">
                  <div className="mx-auto h-1.5 w-full rounded" style={{ background: c as string }} />
                  <div className="mt-0.5 text-[8px] text-gray-500">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-auto space-y-1">
              <div className="h-1.5 rounded bg-gray-100 overflow-hidden flex">
                <div style={{ width: "55%", background: "#16a34a" }} />
                <div style={{ width: "20%", background: "#eab308" }} />
                <div style={{ width: "15%", background: "#dc2626" }} />
                <div style={{ width: "10%", background: "#7c3aed" }} />
              </div>
              <div className="text-[8px] text-gray-500">Score distribution</div>
            </div>
          </div>
          <PdfFooterStrip appName={appName} footerText={footerLeft} pageLabel="Page 1 of 12" />
        </div>

        {/* Interior page mock */}
        <div className="rounded-md border bg-white shadow-sm overflow-hidden aspect-[8.5/11] flex flex-col">
          <div className="px-3 py-2 border-b flex items-center justify-between text-[9px] text-gray-500">
            <span className="truncate">SEO Audit — example.com</span>
            <span>{appName}</span>
          </div>
          <div className="p-3 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded" style={{ background: primary }} />
              <div className="text-[11px] font-semibold text-gray-900">Priority issues</div>
            </div>
            {[
              ["FAIL", "#dc2626", "Missing meta description"],
              ["WARN", "#eab308", "H1 not unique on 3 pages"],
              ["FAIL", "#dc2626", "Broken internal links (5)"],
            ].map(([badge, c, title]) => (
              <div key={title} className="rounded border p-2 flex gap-2 items-start">
                <div className="w-1 self-stretch rounded" style={{ background: c as string }} />
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <span
                      className="text-white text-[8px] font-bold px-1 rounded"
                      style={{ background: c as string }}
                    >
                      {badge}
                    </span>
                    <span className="text-[10px] font-medium text-gray-900 truncate">{title}</span>
                  </div>
                  <div className="mt-0.5 h-1 rounded bg-gray-100 w-11/12" />
                  <div className="mt-1 h-1 rounded bg-gray-100 w-8/12" />
                </div>
              </div>
            ))}
          </div>
          <PdfFooterStrip appName={appName} footerText={footerLeft} pageLabel="Page 4 of 12" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Live preview of how your cover, header band, and footer will appear on exported PDF reports. Update the fields
        above to see changes instantly.
      </p>
    </div>
  );
}

function PdfFooterStrip({ appName, footerText, pageLabel }: { appName: string; footerText: string; pageLabel: string }) {
  return (
    <div className="px-3 py-1.5 border-t flex items-center justify-between text-[8px] text-gray-500 gap-2">
      <span className="truncate flex-1" title={footerText}>{footerText}</span>
      <span className="whitespace-nowrap">{pageLabel}</span>
    </div>
  );
}