import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/role.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LayoutDashboard, ListChecks, Users, Settings as SettingsIcon, Home as HomeIcon, Wallet, LifeBuoy, Megaphone, Bell as BellIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const fetchRole = useServerFn(getMyRole);
  const fetchCreatorStatus = useServerFn(getMyCreatorStatus);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["role"], queryFn: () => fetchRole() });
  const { data: creatorStatus, isLoading: creatorLoading } = useQuery({ queryKey: ["creator-status"], queryFn: () => fetchCreatorStatus() });

  if (isLoading || creatorLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  const isCreator = !!data?.isCreator || !!creatorStatus?.can_create;
  const isAdmin = !!data?.isAdmin;
  if (!isCreator && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Creators only</h1>
          <p className="text-muted-foreground mb-4">Creator access is currently unavailable. Check the free-tier setting or contact support.</p>
          <Button onClick={() => navigate({ to: "/" })}>Go home</Button>
        </div>
      </div>
    );
  }

  const items = [
    { to: "/admin", icon: LayoutDashboard, label: "Dashboard", adminOnly: false },
    { to: "/admin/quizzes", icon: ListChecks, label: "Quizzes", adminOnly: false },
    { to: "/admin/exams", icon: ListChecks, label: "Exams", adminOnly: false },
    { to: "/admin/users", icon: Users, label: "Users & money", adminOnly: true },
    { to: "/admin/ads", icon: Megaphone, label: "Ads", adminOnly: true },
    { to: "/admin/notifications", icon: BellIcon, label: "Notifications", adminOnly: true },
    { to: "/admin/guides", icon: LifeBuoy, label: "Guides", adminOnly: true },
    { to: "/admin/payments", icon: Wallet, label: "Payments", adminOnly: true },
    { to: "/admin/proofs", icon: Wallet, label: "Receipts", adminOnly: true },
    { to: "/admin/settings", icon: SettingsIcon, label: "Settings", adminOnly: true },
  ].filter((it) => isAdmin || !it.adminOnly);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="md:w-60 md:min-h-screen bg-sidebar text-sidebar-foreground p-4 flex md:flex-col gap-2 overflow-x-auto">
        <div className="hidden md:flex items-center gap-2 mb-6 px-2">
          <div className="h-8 w-8 rounded bg-accent flex items-center justify-center text-accent-foreground font-bold text-sm">HQ</div>
          <span className="font-bold">HaniLearn-QZ</span>
        </div>
        {items.map((it) => (
          <Link key={it.to} to={it.to as any} activeOptions={{ exact: it.to === "/admin" }}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent whitespace-nowrap"
            activeProps={{ className: "bg-sidebar-accent" }}>
            <it.icon className="h-4 w-4" />{it.label}
          </Link>
        ))}
        <Link to="/" className="md:mt-auto flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent">
          <HomeIcon className="h-4 w-4" />Back to app
        </Link>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="border-b bg-card px-4 py-3 flex justify-end gap-2">
          <ThemeToggle />
        </header>
        <div className="p-4 md:p-8"><Outlet /></div>
      </main>
    </div>
  );
}
