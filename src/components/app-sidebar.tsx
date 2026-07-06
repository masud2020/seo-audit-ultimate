import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, PlayCircle, History, TrendingUp, ListChecks, CalendarDays, Type as TypeIcon, Radio, Bot, Settings, LogOut, Search, Wrench, Network, Users, FolderKanban, CalendarClock, Sparkles, LineChart } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const groups: { label: string; items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  { label: "Overview", items: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Projects", url: "/projects", icon: FolderKanban },
    { title: "New Audit", url: "/audit/new", icon: PlayCircle },
    { title: "Audit History", url: "/history", icon: History },
    { title: "Scheduled Audits", url: "/scheduled", icon: CalendarClock },
  ]},
  { label: "Tools", items: [
    { title: "Keyword Rank Tracker", url: "/keywords", icon: TrendingUp },
    { title: "SERP Tracking", url: "/rank-tracking", icon: LineChart },
    { title: "Site Crawler", url: "/crawler", icon: Network },
    { title: "Competitors & Backlinks", url: "/competitors", icon: Users },
    { title: "SEO Checklist 2026", url: "/checklist", icon: ListChecks },
    { title: "Algorithm Calendar", url: "/calendar", icon: CalendarDays },
    { title: "Word Counter", url: "/word-counter", icon: TypeIcon },
    { title: "Ping Sites", url: "/ping", icon: Radio },
    { title: "More Tools", url: "/tools", icon: Wrench },
  ]},
  { label: "AI", items: [
    { title: "AI Visibility", url: "/ai-visibility", icon: Bot },
    { title: "Content Optimizer", url: "/content-optimizer", icon: Sparkles },
  ]},
  { label: "Settings", items: [
    { title: "API Settings", url: "/settings", icon: Settings },
  ]},
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const filtered = groups.map(g => ({ ...g, items: g.items.filter(i => i.title.toLowerCase().includes(q.toLowerCase())) })).filter(g => g.items.length);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground shrink-0"><Search className="h-4 w-4" /></div>
          {!collapsed && <span className="text-sm font-semibold truncate">SEO Audit</span>}
        </div>
        {!collapsed && (
          <div className="px-2 pb-2">
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        {filtered.map(g => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map(i => {
                  const active = currentPath === i.url || (i.url !== "/dashboard" && currentPath.startsWith(i.url));
                  return (
                    <SidebarMenuItem key={i.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={i.title}>
                        <Link to={i.url}>
                          <i.icon className="h-4 w-4" />
                          <span>{i.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}