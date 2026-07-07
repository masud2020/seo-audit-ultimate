import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateSectionRecommendations, listSectionRecommendations, type Fix } from "@/lib/ai-recs.functions";
import type { NormalizedReport, Section } from "@/lib/report-core";

type ReportType = NormalizedReport["type"];

export function AiRecommendationsPanel({ report }: { report: NormalizedReport }) {
  const list = useServerFn(listSectionRecommendations);
  const { data: cached } = useQuery({
    queryKey: ["ai-recs", report.type, report.id],
    queryFn: () => list({ data: { report_id: report.id, report_type: report.type } }),
  });

  const cachedMap = new Map<string, { summary: string; fixes: Fix[] }>();
  for (const r of cached ?? []) cachedMap.set(r.section_slug, { summary: r.summary, fixes: r.fixes });

  const eligible = report.sections.filter((s) => s.findings.some((f) => f.status === "fail" || f.status === "warn"));
  if (!eligible.length) {
    return (
      <Card className="p-5 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-400" />
        <div>
          <div className="text-sm font-medium">Nothing to recommend</div>
          <div className="text-xs text-muted-foreground">Every check is passing — no AI fixes needed.</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">AI recommendations</h2>
        <Badge variant="outline" className="text-[10px]">{eligible.length} section{eligible.length === 1 ? "" : "s"} with issues</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {eligible.map((section) => (
          <SectionRecs key={section.id} report={report} section={section} initial={cachedMap.get(section.id)} />
        ))}
      </div>
    </div>
  );
}

function SectionRecs({ report, section, initial }: { report: NormalizedReport; section: Section; initial?: { summary: string; fixes: Fix[] } }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ summary: string; fixes: Fix[] } | null>(initial ?? null);
  const qc = useQueryClient();
  const gen = useServerFn(generateSectionRecommendations);
  const mut = useMutation({
    mutationFn: () => gen({
      data: {
        report_id: report.id,
        report_type: report.type as ReportType,
        section_slug: section.id,
        section_title: section.title,
        findings: section.findings.map((f) => ({
          label: f.label,
          status: f.status,
          detail: f.detail,
          value: (typeof f.value === "string" || typeof f.value === "number" || f.value === null) ? f.value : undefined,
        })),
      },
    }),
    onSuccess: (r) => {
      setState({ summary: r.summary, fixes: r.fixes });
      setOpen(true);
      qc.invalidateQueries({ queryKey: ["ai-recs", report.type, report.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate recommendations"),
  });

  const failing = section.findings.filter((f) => f.status === "fail").length;
  const warn = section.findings.filter((f) => f.status === "warn").length;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{section.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            <span className="text-rose-400">{failing} failing</span> · <span className="text-amber-400">{warn} warning</span>
          </div>
        </div>
        {!state ? (
          <Button size="sm" variant="secondary" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating…</> : <><Sparkles className="h-3 w-3 mr-1" />Generate</>}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
      </div>

      {state && open && (
        <div className="mt-3 space-y-3">
          {state.summary && <p className="text-xs text-muted-foreground">{state.summary}</p>}
          <ul className="space-y-2">
            {state.fixes.map((fix, i) => (
              <li key={i} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="text-xs font-semibold flex-1">{fix.title}</div>
                  <Badge variant="outline" className="text-[9px] uppercase">Impact {fix.impact}</Badge>
                  <Badge variant="outline" className="text-[9px] uppercase">Effort {fix.effort}</Badge>
                </div>
                <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-muted-foreground">
                  {fix.steps.map((s, ix) => <li key={ix}>{s}</li>)}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}