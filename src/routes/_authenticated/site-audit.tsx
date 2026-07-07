import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startSiteAudit, listSiteAudits, deleteSiteAudit } from "@/lib/site-audit.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Trash2, Eye, Globe, FileText } from "lucide-react";
import { generateSiteAuditPdf } from "@/lib/pdf.functions";

type SiteAuditRow = { id: string; start_url: string; status: string; overall_score: number | null; pages_audited: number; max_pages: number; created_at: string; error: string | null };

export const Route = createFileRoute("/_authenticated/site-audit")({ component: SiteAuditPage });

function scoreColor(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-rose-400";
}

function SiteAuditPage() {
  const start = useServerFn(startSiteAudit);
  const list = useServerFn(listSiteAudits);
  const del = useServerFn(deleteSiteAudit);
  const sitePdf = useServerFn(generateSiteAuditPdf);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["site-audits"], queryFn: () => list() });
  const [url, setUrl] = useState("");
  const [max, setMax] = useState(25);
  const m = useMutation({
    mutationFn: () => start({ data: { start_url: url, max_pages: max } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["site-audits"] }); navigate({ to: "/site-audit/$id", params: { id: r.id } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Site audit failed"),
  });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["site-audits"] }) });
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const downloadPdf = async (id: string) => {
    setPdfBusyId(id);
    try {
      const { base64, filename } = await sitePdf({ data: { site_audit_id: id } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Globe className="h-6 w-6" />Whole Site Audit</h1>
        <p className="text-sm text-muted-foreground">Crawl a site and run the full SEO audit engine on every discovered page. Results saved to the database.</p>
      </div>
      <Card className="p-4">
        <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); if (url) m.mutate(); }}>
          <div className="flex-1 min-w-64">
            <label className="text-xs text-muted-foreground">Start URL</label>
            <Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="w-32">
            <label className="text-xs text-muted-foreground">Max pages</label>
            <Input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value) || 25)} />
          </div>
          <Button disabled={m.isPending || !url}>
            {m.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Auditing site…</> : <><Play className="h-4 w-4 mr-2" />Start Site Audit</>}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">Large sites can take a few minutes. Progress and results appear as each page finishes.</p>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Start URL</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Pages</th><th className="px-4 py-2">Created</th><th className="px-4 py-2 w-24">Actions</th></tr>
          </thead>
          <tbody>
            {((data ?? []) as SiteAuditRow[]).map((row) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-2 truncate max-w-md">{row.start_url}</td>
                <td className="px-4 py-2"><Badge variant={row.status === "complete" ? "default" : row.status === "error" ? "destructive" : "secondary"}>{row.status}</Badge></td>
                <td className={`px-4 py-2 font-semibold ${scoreColor(row.overall_score)}`}>{row.overall_score ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{row.pages_audited}/{row.max_pages}</td>
                <td className="px-4 py-2 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <Button asChild size="sm" variant="ghost"><Link to="/site-audit/$id" params={{ id: row.id }}><Eye className="h-3.5 w-3.5" /></Link></Button>
                    <Button size="sm" variant="ghost" disabled={row.status !== "complete" || pdfBusyId === row.id} onClick={() => downloadPdf(row.id)} title="Download PDF report">
                      {pdfBusyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => mDel.mutate(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No site audits yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}