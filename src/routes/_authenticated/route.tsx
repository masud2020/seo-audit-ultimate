import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandProvider, useBrand } from "@/components/brand-provider";
import { NotificationsBell } from "@/components/notifications-bell";
import { AppFooter } from "@/components/app-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyApproval } from "@/lib/approval.functions";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  return (
    <BrandProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col">
            <LayoutHeader />
            <main className="flex-1 p-6"><ApprovalGate><Outlet /></ApprovalGate></main>
            <AppFooter />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </BrandProvider>
  );
}

function ApprovalGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const nav = useNavigate();
  const load = useServerFn(getMyApproval);
  const { data, isLoading } = useQuery({
    queryKey: ["my-approval"],
    queryFn: () => load(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const onPendingPage = location.pathname === "/pending-approval";

  useEffect(() => {
    if (!data) return;
    if (!data.is_active && !onPendingPage) {
      nav({ to: "/pending-approval", replace: true });
    } else if (data.is_active && onPendingPage) {
      nav({ to: "/dashboard", replace: true });
    }
  }, [data, onPendingPage, nav]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>;
  if (data && !data.is_active && !onPendingPage) return null;
  return <>{children}</>;
}

function LayoutHeader() {
  const brand = useBrand();
  return (
    <header className="h-12 flex items-center gap-2 border-b border-border px-3 sticky top-0 bg-background/95 backdrop-blur z-10">
      <SidebarTrigger />
      <div className="text-xs text-muted-foreground truncate">{brand.app_name ?? "SEO Audit Tool"}</div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationsBell />
      </div>
    </header>
  );
}