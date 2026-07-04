import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, GraduationCap, Plus, User, Shield, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/explore", icon: Compass, label: "Explore" },
  { to: "/exams", icon: GraduationCap, label: "Exams" },
  { to: "/create", icon: Plus, label: "Create" },
  { to: "/wallet", icon: Wallet, label: "Wallet" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function AppNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const full = [...items, ...(isSuperAdmin ? [{ to: "/admin", icon: Shield, label: "Super" }] : [])];
  return (
    <nav className="fixed md:sticky md:top-0 md:h-screen bottom-0 md:bottom-auto inset-x-0 md:inset-auto md:w-56 z-30 bg-card/95 backdrop-blur border-t md:border-t-0 md:border-r flex md:flex-col md:items-stretch">
      <div className="hidden md:flex items-center gap-2 p-4 border-b">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">HQ</div>
        <span className="font-bold text-sm">HaniLearn-QZ</span>
      </div>
      <div className="flex md:flex-col md:p-2 flex-1 justify-around md:justify-start overflow-x-auto">
        {full.map((it) => {
          const active = path === it.to || (it.to !== "/explore" && path.startsWith(it.to));
          return (
            <Link key={it.to} to={it.to as any}
              className={cn(
                "flex md:flex-row flex-col items-center md:justify-start justify-center gap-1 md:gap-3 md:px-3 md:py-2.5 py-2 md:my-0.5 text-[10px] md:text-sm md:rounded-lg transition flex-1 md:flex-none min-w-[52px]",
                active ? "text-primary md:bg-primary/10 md:text-primary font-semibold" : "text-muted-foreground hover:text-foreground md:hover:bg-accent/50",
              )}
            >
              <it.icon className="h-5 w-5 md:h-4 md:w-4" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children, isSuperAdmin }: { children: React.ReactNode; isSuperAdmin?: boolean }) {
  return (
    <div className="min-h-screen bg-background md:flex">
      <AppNav isSuperAdmin={isSuperAdmin} />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
