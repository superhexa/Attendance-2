import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, CalendarClock, Bell, Menu, QrCode, Users2, GraduationCap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Beautiful floating bottom navigation for mobile (lg:hidden).
 * Shows 4 role-based quick actions + a "menu" button that opens the full sidebar.
 * Uses an animated highlight pill that slides to the active item.
 */
export function MobileBottomNav({ onOpenMenu, unreadCount = 0 }) {
  const { user, can, hasRole } = useAuth();
  const { t, lang } = useLang();
  const location = useLocation();

  if (!user || !user.id) return null;

  // Build role-appropriate items (max 4, then + Menu = 5 total)
  const all = [
    { key: "dashboard", to: "/dashboard", icon: LayoutDashboard, label: t("nav.dashboard") },
    { key: "scan", to: "/scan", icon: QrCode, label: lang === "ar" ? "مسح" : "Scan", show: hasRole("STUDENT") },
    { key: "take", to: "/take-attendance", icon: ClipboardCheck, label: lang === "ar" ? "تسجيل" : "Take", show: can("attendance.create") },
    { key: "attendance", to: "/attendance", icon: CalendarClock, label: t("nav.attendance"), show: can("attendance.view") },
    { key: "students", to: "/students", icon: GraduationCap, label: t("nav.students"), show: can("students.view") },
    { key: "teachers", to: "/teachers", icon: Users2, label: t("nav.teachers"), show: can("teachers.view") },
    { key: "notifications", to: "/notifications", icon: Bell, label: t("nav.notifications"), badge: unreadCount },
  ];
  const visible = all.filter((i) => i.show !== false).slice(0, 4);

  const items = [
    ...visible,
    { key: "menu", label: lang === "ar" ? "القائمة" : "Menu", icon: Menu, action: onOpenMenu },
  ];

  return (
    <>
      {/* Spacer so page content isn't hidden behind the nav */}
      <div className="h-24 lg:hidden" aria-hidden="true" />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="mobile-bottom-nav"
      >
        {/* Soft gradient fade behind the nav to keep it airy */}
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-slate-900/5 to-transparent" />

        <div className="mx-auto max-w-md px-3 pb-3 pt-1">
          <div className="relative flex items-center justify-around rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1.5 shadow-[0_10px_40px_-10px_rgba(15,76,58,0.25)] backdrop-blur-xl">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.to && (location.pathname === item.to || (item.to !== "/dashboard" && location.pathname.startsWith(item.to)));

              const inner = (
                <div className="relative flex flex-1 flex-col items-center justify-center">
                  <div
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300",
                      isActive
                        ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 -translate-y-1 scale-110"
                        : "text-slate-500 hover:text-emerald-700"
                    )}
                  >
                    <Icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.4 : 2} />
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 truncate text-[10px] font-bold leading-tight transition-colors",
                      isActive ? "text-emerald-700" : "text-slate-500"
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              );

              if (item.action) {
                return (
                  <button
                    key={item.key}
                    onClick={item.action}
                    type="button"
                    className="flex-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl"
                    data-testid={`bnav-${item.key}`}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className="flex-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl"
                  data-testid={`bnav-${item.key}`}
                >
                  {inner}
                </NavLink>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
