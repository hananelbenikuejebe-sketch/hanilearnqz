import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Settings2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavEditor, type NavCatalogEntry } from "@/components/nav-editor";
import { getMyNavPrefs, saveMyNavPrefs, DEFAULT_NAV_ITEMS, type NavItemId } from "@/lib/nav-prefs.functions";

const CATALOG: Record<NavItemId, { to: string; icon: any; label: string }> = {
  explore: { to: "/explore", icon: Compass, label: "Explore" },
  create: { to: "/create", icon: Plus, label: "Create" },
  wallet: { to: "/wallet", icon: Wallet, label: "Wallet" },
  messages: { to: "/messages", icon: MessageCircle, label: "Messages" },
  profile: { to: "/profile", icon: User, label: "Profile" },
  exams: { to: "/exams", icon: GraduationCap, label: "Exams" },
  notifications: { to: "/notifications", icon: Bell, label: "Notifications" },
  support: { to: "/support", icon: LifeBuoy, label: "Help" },
  admin: { to: "/admin", icon: Shield, label: "Super admin" },
};

function isActive(path: string, to: string) {
  return path === to || (to !== "/explore" && path.startsWith(to));
}

function useScrollDirectionVisible() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setVisible(true);
    lastY.current = window.scrollY;
  }, [path]);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 24) {
        setVisible(true);
      } else if (delta > 8) {
        setVisible(false);
      } else if (delta < -8) {
        setVisible(true);
      }
      lastY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return visible;
}

function useNavPrefs(isSuperAdmin: boolean) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyNavPrefs);
  const saveFn = useServerFn(saveMyNavPrefs);

  const { data } = useQuery({
    queryKey: ["nav-prefs"],
    queryFn: async () => {
      try {
        return await getFn();
      } catch {
        return { items: [...DEFAULT_NAV_ITEMS] as NavItemId[] };
      }
    },
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (items: NavItemId[]) => saveFn({ data: { items } }),
    onSuccess: (_r, items) => {
      qc.setQueryData(["nav-prefs"], { items });
    },
  });

  const rawItems = (data?.items as NavItemId[] | undefined) ?? [...DEFAULT_NAV_ITEMS];
  const items = rawItems.filter((id) => id !== "admin" || isSuperAdmin);

  return { items: items.length >= 2 ? items : [...DEFAULT_NAV_ITEMS], saveMutation };
}

export function AppNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const visible = useScrollDirectionVisible();
  const { items: primaryIds, saveMutation } = useNavPrefs(isSuperAdmin);

  const primaryItems = useMemo(
    () => primaryIds.map((id) => ({ id, ...CATALOG[id] })),
    [primaryIds],
  );

  const fullMore = useMemo(() => {
    const all: NavItemId[] = ["exams", "wallet", "notifications", "support", ...(isSuperAdmin ? (["admin"] as NavItemId[]) : [])];
    return all.filter((id) => !primaryIds.includes(id)).map((id) => ({ id, ...CATALOG[id] }));
  }, [primaryIds, isSuperAdmin]);

  const moreActive = fullMore.some((it) => isActive(path, it.to));

  const catalog: NavCatalogEntry[] = useMemo(
    () =>
      (Object.keys(CATALOG) as NavItemId[])
        .filter((id) => id !== "admin" || isSuperAdmin)
        .map((id) => ({ id, label: CATALOG[id].label, icon: CATALOG[id].icon })),
    [isSuperAdmin],
  );

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
          <NotificationBell />
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
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span className="truncate">Customise nav</span>
          </button>
        </div>
        <div className="flex items-center justify-between border-t p-3">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </nav>

      {/* Mobile bottom tab bar — full width, roughly double the height of the
          Lovable edit badge, with tappable controls kept in the upper portion
          so the badge (bottom-right) only ever overlaps empty padding. */}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 h-20 border-t bg-card/95 backdrop-blur transition-transform duration-300 ease-out md:hidden",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex h-full items-start justify-around pt-2">
          {primaryItems.map((it) => (
            <TabLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={isActive(path, it.to)} />
          ))}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px]",
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
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setEditorOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50"
                >
                  <Settings2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">Customise nav</span>
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {/* Safe-area padding lives below the tappable row, exactly where the
            floating Lovable edit badge sits, so it never covers a control. */}
        <div className="safe-bottom" aria-hidden />
      </nav>

      <NavEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        catalog={catalog}
        value={primaryIds}
        saving={saveMutation.isPending}
        onSave={(items) => {
          saveMutation.mutate(items, {
            onSuccess: () => setEditorOpen(false),
          });
        }}
      />
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
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px]",
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
      <main className="min-w-0 flex-1 overflow-x-hidden pb-24 md:pb-0">{children}</main>
    </div>
  );
}
