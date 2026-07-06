import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, PlayCircle, History, TrendingUp, ListChecks, CalendarDays, Type as TypeIcon, Radio, Bot, Settings, LogOut, Search, Wrench, Network, Users, FolderKanban, CalendarClock, Sparkles, LineChart, Layers, ShieldCheck, GitCompareArrows, ShieldAlert, Link2Off, Rss, Quote, ScanText, SlidersHorizontal, UserCog, HelpCircle, Trophy, Globe, Link as LinkIcon, Zap, Smartphone, FileCode2, Braces } from "lucide-react";
import { useBrand } from "@/components/brand-provider";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkAdminStatus } from "@/lib/admin.functions";

const groups: { label: string; items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  { label: "Overview", items: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Projects", url: "/projects", icon: FolderKanban },
    { title: "New Audit", url: "/audit/new", icon: PlayCircle },
    { title: "Bulk Audit", url: "/audit/bulk", icon: Layers },
    { title: "Whole Site Audit", url: "/site-audit", icon: Globe },
    { title: "Audit History", url: "/history", icon: History },
    { title: "Tool Run History", url: "/tool-history", icon: History },
    { title: "Scheduled Audits", url: "/scheduled", icon: CalendarClock },
  ]},
  { label: "Tools", items: [
    { title: "Keyword Rank Tracker", url: "/keywords", icon: TrendingUp },
    { title: "SERP Tracking", url: "/rank-tracking", icon: LineChart },
    { title: "Keyword Discovery", url: "/keyword-discovery", icon: Search },
    { title: "People Also Search", url: "/people-also-search", icon: Users },
    { title: "People Also Ask", url: "/people-also-ask", icon: HelpCircle },
    { title: "Site Crawler", url: "/crawler", icon: Network },
    { title: "Competitors & Backlinks", url: "/competitors", icon: Users },
    { title: "Gap Analysis", url: "/gaps", icon: GitCompareArrows },
    { title: "Toxic Backlinks", url: "/disavow", icon: ShieldAlert },
    { title: "SEO Checklist 2026", url: "/checklist", icon: ListChecks },
    { title: "Algorithm Calendar", url: "/calendar", icon: CalendarDays },
    { title: "Word Counter", url: "/word-counter", icon: TypeIcon },
    { title: "Ping Sites", url: "/ping", icon: Radio },
    { title: "More Tools", url: "/tools", icon: Wrench },
  ]},
  { label: "AI", items: [
    { title: "AI Visibility", url: "/ai-visibility", icon: Bot },
    { title: "Content Optimizer", url: "/content-optimizer", icon: Sparkles },
    { title: "AI Content Detection", url: "/ai-detection", icon: ScanText },
    { title: "AI Citation Checker", url: "/ai-citations", icon: Quote },
    { title: "AI Citation Potential", url: "/ai-potential", icon: Sparkles },
    { title: "AI Search Rank", url: "/ai-search-rank", icon: Trophy },
    { title: "AI Search Comparison", url: "/ai-search-comparison", icon: GitCompareArrows },
  ]},
  { label: "Monitoring", items: [
    { title: "Broken Link Checker", url: "/broken-links", icon: Link2Off },
    { title: "Backlink Monitor", url: "/backlink-monitor", icon: ShieldCheck },
    { title: "SEO Blog Feed", url: "/seo-news", icon: Rss },
  ]},
  { label: "Site Audit Tools", items: [
    { title: "Backlink Checker", url: "/backlink-checker", icon: LinkIcon },
    { title: "Website Speed", url: "/website-speed", icon: Zap },
    { title: "Responsive Check", url: "/responsive-check", icon: Smartphone },
    { title: "HTML Validator", url: "/html-validator", icon: FileCode2 },
    { title: "Schema Validator", url: "/schema-validator", icon: Braces },
  ]},
  { label: "Settings", items: [
    { title: "API Settings", url: "/settings", icon: Settings },
    { title: "Preferences & Branding", url: "/preferences", icon: SlidersHorizontal },
    { title: "Search Console", url: "/gsc", icon: ShieldCheck },
    { title: "Admin Panel", url: "/admin", icon: UserCog },
  ]},
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const brand = useBrand();
  const checkAdmin = useServerFn(checkAdminStatus);
  const { data: adminStatus } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => checkAdmin(),
    staleTime: 60_000,
  });
  const isAdmin = !!adminStatus?.isAdmin;

  const filtered = groups
    .map(g => ({
      ...g,
      items: g.items
        .filter(i => i.url !== "/admin" || isAdmin)
        .filter(i => i.title.toLowerCase().includes(q.toLowerCase())),
    }))
    .filter(g => g.items.length);

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
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
          ) : (
            <div className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground shrink-0"><Search className="h-4 w-4" /></div>
          )}
          {!collapsed && <span className="text-sm font-semibold truncate">{brand.app_name ?? "SEO Audit"}</span>}
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