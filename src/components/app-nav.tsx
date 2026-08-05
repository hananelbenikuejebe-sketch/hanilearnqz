import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Compass,
  GraduationCap,
  Plus,
  User,
  Shield,
  Wallet,
  MessageCircle,
  LifeBuoy,
  Bell,
  Menu,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const primaryItems = [
  { to: "/explore", icon: Compass, label: "Explore" },
  { to: "/create", icon: Plus, label: "Create" },
  { to: "/messages", icon: MessageCircle, label: "Messages" },
  { to: "/profile", icon: User, label: "Profile" },
];

const moreItems = [
  { to: "/exams", icon: GraduationCap, label: "Exams" },
  { to: "/wallet", icon: Wallet, label: "Wallet" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/support", icon: LifeBuoy, label: "Help" },
];

function isActive(path: string, to: string) {
  return path === to || (to !== "/explore" && path.startsWith(to));
}

export function AppNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const fullMore = [...moreItems, ...(isSuperAdmin ? [{ to: "/admin", icon: Shield, label: "Super admin" }] : [])];
  const moreActive = fullMore.some((it) => isActive(path, it.to));

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-card/95 px-3 backdrop-blur md:hidden">
        <Link to="/explore" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            HQ
          </div>
          <span className="text-sm font-semibold tracking-tight">HaniLearn-QZ</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      {/* Desktop sidebar */}
      <nav className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-card/95 md:flex">
        <div className="flex items-center gap-2 border-b p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            HQ
          </div>
          <span className="text-sm font-bold tracking-tight">HaniLearn-QZ</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-2">
          {primaryItems.map((it) => (
            <NavLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={isActive(path, it.to)} />
          ))}
          <div className="my-1 border-t" />
          {fullMore.map((it) => (
            <NavLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={isActive(path, it.to)} />
          ))}
        </div>
        <div className="flex items-center justify-between border-t p-3">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t bg-card/95 backdrop-blur md:hidden">
        {primaryItems.map((it) => (
          <TabLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={isActive(path, it.to)} />
        ))}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
                moreActive ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="h-5 w-5" />
              <span className="truncate">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="safe-bottom">
            <SheetHeader>
              <SheetTitle className="text-sm">More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 p-4 pt-0">
              {fullMore.map((it) => (
                <Link
                  key={it.to}
                  to={it.to as any}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm",
                    isActive(path, it.to) ? "border-primary/40 bg-primary/10 text-primary" : "hover:bg-accent/50",
                  )}
                >
                  <it.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}

function NavLink({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link
      to={to as any}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
        active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function TabLink({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link
      to={to as any}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
        active ? "font-semibold text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppShell({ children, isSuperAdmin }: { children: React.ReactNode; isSuperAdmin?: boolean }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background md:flex">
      <AppNav isSuperAdmin={isSuperAdmin} />
      <main className="min-w-0 flex-1 overflow-x-hidden pb-16 md:pb-0">{children}</main>
    </div>
  );
}
