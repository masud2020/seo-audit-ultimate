import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, FileSpreadsheet, Link2, Loader2, Copy, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toCsv, type NormalizedReport } from "@/lib/report-core";
import { createReportShare } from "@/lib/report-share.functions";
import { listSectionRecommendations } from "@/lib/ai-recs.functions";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ExportMenu({ report }: { report: NormalizedReport }) {
  const [shareOpen, setShareOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState("30");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const share = useServerFn(createReportShare);
  const listRecs = useServerFn(listSectionRecommendations);
  const [csvBusy, setCsvBusy] = useState(false);
  const createShare = useMutation({
    mutationFn: () => share({ data: { report_id: report.id, report_type: report.type, expires_in_days: Number(expiryDays) } }),
    onSuccess: (r) => {
      const url = `${window.location.origin}/shared/report/${r.token}`;
      setShareUrl(url);
      toast.success("Share link created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create share link"),
  });

  const filenameBase = `${report.type}-${(report.title || "report").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`;

  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      let recs: Awaited<ReturnType<typeof listRecs>> = [];
      try {
        recs = await listRecs({ data: { report_id: report.id, report_type: report.type } });
      } catch {
        // Non-fatal: export data without AI recs.
      }
      download(`${filenameBase}.csv`, toCsv(report, recs), "text/csv;charset=utf-8");
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />Export</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={csvBusy} onSelect={(e) => { e.preventDefault(); void exportCsv(); }}>
            {csvBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Download CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => {
            const url = `/api/reports/${report.id}/pdf?type=${report.type}`;
            window.open(url, "_blank", "noopener");
          }}>
            <FileText className="h-4 w-4 mr-2" />Printable HTML / PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setShareUrl(""); setShareOpen(true); }}>
            <Link2 className="h-4 w-4 mr-2" />Create share link…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a read-only share link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1">Expires in</div>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shareUrl ? (
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} />
                <Button variant="outline" size="icon" onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Anyone with the link can view this report read-only until it expires. No account or personal data is included.
              </p>
            )}
          </div>
          <DialogFooter>
            {!shareUrl && (
              <Button onClick={() => createShare.mutate()} disabled={createShare.isPending}>
                {createShare.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create link"}
              </Button>
            )}
            {shareUrl && <Button variant="outline" onClick={() => setShareOpen(false)}>Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}