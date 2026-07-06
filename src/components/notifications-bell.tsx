import { useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
  TOOL_LABELS,
  type ToolKey,
  type NotificationRow,
} from "@/lib/notifications.functions";

const TOOL_ROUTES: Record<string, string> = {
  broken_links: "/broken-links",
  backlink_monitor: "/backlink-monitor",
  ai_detection: "/ai-detection",
  ai_citations: "/ai-citations",
  ai_potential: "/ai-potential",
  seo_news: "/seo-news",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationsBell() {
  const list = useServerFn(listNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const del = useServerFn(deleteNotification);
  const clearAll = useServerFn(clearNotifications);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const items: NotificationRow[] = useMemo(() => data?.items ?? [], [data]);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`notif-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as NotificationRow;
            const label = TOOL_LABELS[row.tool as ToolKey] ?? row.tool;
            if (row.status === "error") toast.error(`${label} failed`, { description: row.message });
            else toast.success(`${label} finished`, { description: row.message });
            qc.invalidateQueries({ queryKey: ["notifications"] });
          },
        )
        .subscribe();
      cleanup = () => { supabase.removeChannel(channel); };
    })();
    return () => { cancelled = true; if (cleanup) cleanup(); };
  }, [qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const mMark = useMutation({ mutationFn: (id: string) => markOne({ data: { id } }), onSuccess: invalidate });
  const mMarkAll = useMutation({ mutationFn: () => markAll(), onSuccess: invalidate });
  const mDel = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: invalidate });
  const mClear = useMutation({ mutationFn: () => clearAll(), onSuccess: invalidate });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-sm font-semibold">Notifications</div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => mMarkAll.mutate()} disabled={unread === 0} title="Mark all read">
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mClear.mutate()} disabled={items.length === 0} title="Clear all">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-[380px]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const label = TOOL_LABELS[n.tool as ToolKey] ?? n.tool;
                const route = TOOL_ROUTES[n.tool] ?? "/tool-history";
                return (
                  <li key={n.id} className={`p-3 text-sm ${n.read ? "" : "bg-muted/40"}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={n.status === "error" ? "destructive" : "default"} className="text-[10px] uppercase tracking-wide">
                            {n.status}
                          </Badge>
                          <span className="font-medium truncate">{label}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <Link to={route}>Open <ExternalLink className="ml-1 h-3 w-3" /></Link>
                          </Button>
                          {!n.read && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => mMark.mutate(n.id)}>
                              <Check className="mr-1 h-3 w-3" /> Mark read
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => mDel.mutate(n.id)}>
                            <Trash2 className="mr-1 h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <Separator />
        <div className="p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center">
            <Link to="/preferences">Notification & branding settings</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}