import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listToolRuns } from "@/lib/tool-runs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

type RunRow = { id: string; label: string | null; created_at: string; status: string; input: unknown; result: unknown };

export function RecentRuns<TResult>({ tool, onLoad }: { tool: string; onLoad: (row: { input: unknown; result: TResult; label: string | null }) => void }) {
  const list = useServerFn(listToolRuns);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["recent-runs", tool],
    queryFn: () => list({ data: { tool, limit: 10 } }) as Promise<RunRow[]>,
    refetchOnWindowFocus: false,
  });
  const rows = (data ?? []).filter((r) => r.status === "success");
  if (rows.length === 0) return null;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground"><History className="h-3.5 w-3.5" />Recent runs (from database)</div>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ["recent-runs", tool] })}>Refresh</Button>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
            <div className="min-w-0 flex-1 truncate">
              <span className="font-medium">{r.label ?? "Run"}</span>
              <span className="text-muted-foreground ml-2">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onLoad({ input: r.input, result: r.result as TResult, label: r.label })}>Load</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}