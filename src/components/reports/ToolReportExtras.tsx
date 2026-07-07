// Shared "exec summary + export + AI recs" block for tool report pages.
// Wraps a tool run result in a NormalizedReport and mounts the three panels.
import { normalizeToolRun } from "@/lib/report-core";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { ExportMenu } from "./ExportMenu";
import { AiRecommendationsPanel } from "./AiRecommendationsPanel";

export function ToolReportExtras({
  runId, tool, label, result,
}: {
  runId: string;
  tool: string;
  label: string;
  result: unknown;
}) {
  if (!runId) return null;
  const report = normalizeToolRun({
    id: runId,
    tool,
    label,
    result: result as Record<string, unknown>,
    finished_at: new Date().toISOString(),
  });
  return (
    <>
      <div className="flex justify-end">
        <ExportMenu report={report} />
      </div>
      <ExecutiveSummary report={report} />
      <AiRecommendationsPanel report={report} />
    </>
  );
}