import { createFileRoute } from "@tanstack/react-router";
import { ALGORITHM_UPDATES, CATEGORY_COLORS } from "@/lib/data/algorithm-updates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendar")({ component: CalendarPage });

function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const firstWeekday = monthStart.getDay();
  const events = useMemo(() => ALGORITHM_UPDATES.filter(u => { const d = new Date(u.date); return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth(); }), [cursor]);
  const eventMap = useMemo(() => { const m: Record<number, typeof ALGORITHM_UPDATES> = {}; for (const e of events) { const d = new Date(e.date).getDate(); (m[d] ??= []).push(e); } return m; }, [events]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Google Algorithm Calendar</h1><p className="text-sm text-muted-foreground">Track major SEO algorithm updates by month.</p></div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-32 text-center">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</span>
          <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="p-2 text-center text-muted-foreground font-medium">{d}</div>)}
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={"e"+i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1; const evs = eventMap[day] ?? [];
            return (
              <div key={day} className="min-h-20 rounded border border-border p-1.5">
                <div className="text-[10px] text-muted-foreground">{day}</div>
                <div className="mt-1 space-y-0.5">
                  {evs.map(e => (
                    <div key={e.date} className="rounded px-1 py-0.5 text-[10px]" style={{ background: CATEGORY_COLORS[e.category], color: "#000" }} title={e.summary}>{e.name}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">All updates</h3>
        <ul className="divide-y divide-border">
          {ALGORITHM_UPDATES.map(u => (
            <li key={u.date} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge style={{ background: CATEGORY_COLORS[u.category], color: "#000" }}>{u.category}</Badge>
                <span className="text-sm font-medium">{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.date}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{u.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground"><b>Impact:</b> {u.impact}</p>
              {u.takeaways.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{u.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}