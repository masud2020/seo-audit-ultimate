import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandProvider, useBrand } from "@/components/brand-provider";
import { NotificationsBell } from "@/components/notifications-bell";
import { AppFooter } from "@/components/app-footer";

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
            <main className="flex-1 p-6"><Outlet /></main>
            <AppFooter />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </BrandProvider>
  );
}

function LayoutHeader() {
  const brand = useBrand();
  return (
    <header className="h-12 flex items-center gap-2 border-b border-border px-3 sticky top-0 bg-background/95 backdrop-blur z-10">
      <SidebarTrigger />
      <div className="text-xs text-muted-foreground truncate">{brand.app_name ?? "SEO Audit Tool"}</div>
      <div className="ml-auto flex items-center gap-1">
        <NotificationsBell />
      </div>
    </header>
  );
}