import React, { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Menu, Search, Bell, Globe, LogOut, User as UserIcon, ChevronDown, School,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { NAV, GROUP_ORDER } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobileBottomNav } from "@/components/MobileBottomNav";

function SidebarContent({ onNavigate }) {
  const { t, lang } = useLang();
  const { can, hasRole, user } = useAuth();
  const items = NAV.filter((n) => {
    if (n.roles && !hasRole(...n.roles)) return false;
    if (n.perm && !can(n.perm)) return false;
    return true;
  });
  const grouped = GROUP_ORDER.map((g) => ({ g, items: items.filter((i) => i.group === g) })).filter((x) => x.items.length);

  return (
    <div className="flex h-full flex-col bg-white text-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
          <School className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-tight text-slate-900">{t("school_short")}</p>
          <p className="truncate text-[11px] text-slate-500">{t("app_name")}</p>
        </div>
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-6">
          {grouped.map(({ g, items }) => (
            <div key={g}>
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t(g)}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      data-testid={`nav-${item.to.replace("/", "")}`}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-emerald-50 text-emerald-700 font-bold"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        )
                      }
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{t(item.key)}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
      <div className="border-t border-slate-200 p-4 text-[11px] text-slate-400">
        v1.0 · 2026/2027
      </div>
    </div>
  );
}

function NotificationBell() {
  const { t } = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 30000,
  });
  const unread = data?.unread_count || 0;
  const markAll = async () => {
    await api.post("/notifications/read-all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notifications-bell">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-bold">{t("nav.notifications")}</span>
          <button onClick={markAll} className="text-xs font-medium text-primary hover:underline" data-testid="mark-all-read">
            {t("PRESENT") ? "تعليم الكل كمقروء" : ""}
          </button>
        </div>
        <ScrollArea className="max-h-80">
          {(data?.items || []).length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("no_data")}</p>
          ) : (
            (data?.items || []).slice(0, 15).map((n) => (
              <div key={n.id} className={cn("border-b p-3 text-sm", !n.read && "bg-muted/40")}>
                <p className="font-semibold text-foreground">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </div>
            ))
          )}
        </ScrollArea>
        <button
          onClick={() => navigate("/notifications")}
          className="w-full border-t p-2.5 text-center text-xs font-medium text-primary hover:bg-muted"
          data-testid="view-all-notifications"
        >
          {t("view")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function GlobalSearch() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!q) { setResults(null); return; }
    const id = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q } });
        setResults(data);
      } catch (e) {}
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="global-search-trigger"
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">{t("search")}</span>
        <kbd className="hidden rounded bg-background px-1.5 text-[10px] font-semibold sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("search")} value={q} onValueChange={setQ} data-testid="global-search-input" />
        <CommandList>
          <CommandEmpty>{t("no_data")}</CommandEmpty>
          {results?.students?.length > 0 && (
            <CommandGroup heading={t("nav.students")}>
              {results.students.map((s) => (
                <CommandItem key={s.id} onSelect={() => { navigate(`/students/${s.id}`); setOpen(false); }}>
                  {s.full_name} {s.student_number ? `· ${s.student_number}` : ""}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results?.teachers?.length > 0 && (
            <CommandGroup heading={t("nav.teachers")}>
              {results.teachers.map((s) => (
                <CommandItem key={s.id} onSelect={() => { navigate("/teachers"); setOpen(false); }}>
                  {s.full_name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results?.subjects?.length > 0 && (
            <CommandGroup heading={t("nav.subjects")}>
              {results.subjects.map((s) => (
                <CommandItem key={s.id} onSelect={() => { navigate("/subjects"); setOpen(false); }}>
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export function Layout() {
  const { t, lang, toggle } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const { data: notifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 30000,
    enabled: !!user?.id,
  });
  const unreadCount = notifs?.unread_count || 0;

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const initials = (user?.full_name || "?").trim().charAt(0);
  const doLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop (right in RTL / left in LTR handled by flex order) */}
      <aside className={cn("fixed inset-y-0 z-40 hidden w-72 lg:block", lang === "ar" ? "border-l border-slate-200" : "border-r border-slate-200")} style={{ [lang === "ar" ? "right" : "left"]: 0 }}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side={lang === "ar" ? "right" : "left"} className="w-72 border-0 p-0">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={cn(lang === "ar" ? "lg:pr-72" : "lg:pl-72")}>
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border glass px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn">
              <Menu className="h-5 w-5" />
            </Button>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={toggle} className="gap-1.5 font-bold" data-testid="lang-toggle">
              <Globe className="h-4 w-4" />
              {lang === "ar" ? "EN" : "ع"}
            </Button>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg py-1 ps-1 pe-2 hover:bg-muted" data-testid="profile-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden text-start sm:block">
                    <p className="text-xs font-bold leading-tight">{user?.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{user?.role}</p>
                  </div>
                  <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="menu-profile">
                  <UserIcon className="h-4 w-4" /> {t("nav.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={doLogout} className="text-rose-600" data-testid="menu-logout">
                  <LogOut className="h-4 w-4" /> {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Beautiful floating mobile bottom nav */}
      <MobileBottomNav onOpenMenu={() => setMobileOpen(true)} unreadCount={unreadCount} />
    </div>
  );
}
