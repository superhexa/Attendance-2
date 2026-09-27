import {
  LayoutDashboard, ClipboardCheck, CalendarClock, GraduationCap, Users2,
  Building2, BookOpen, CalendarDays, FileBarChart, LineChart, Megaphone,
  Bell, ScrollText, ShieldCheck, Settings, QrCode, ClipboardList, UserPlus,
  ScanLine, ArrowRightLeft,
} from "lucide-react";

// Each item: { key, to, icon, perm?, roles?, group }
export const NAV = [
  { key: "nav.dashboard", to: "/dashboard", icon: LayoutDashboard, group: "group_main" },
  { key: "nav.take_attendance", to: "/take-attendance", icon: ClipboardCheck, group: "group_main", perm: "attendance.create" },
  { key: "nav.ocr", to: "/ocr", icon: ScanLine, group: "group_main", perm: "attendance.create" },
  { key: "nav.qr_scan", to: "/scan", icon: QrCode, group: "group_main", roles: ["STUDENT"] },
  { key: "nav.attendance", to: "/attendance", icon: CalendarClock, group: "group_main", perm: "attendance.view" },
  { key: "nav.corrections", to: "/corrections", icon: ClipboardList, group: "group_main", perm: "attendance.view" },

  { key: "nav.structure", to: "/structure", icon: Building2, group: "group_academic", perm: "structure.view" },
  { key: "nav.subjects", to: "/subjects", icon: BookOpen, group: "group_academic", perm: "subjects.view" },
  { key: "nav.timetable", to: "/timetable", icon: CalendarDays, group: "group_academic", perm: "timetable.view" },

  { key: "nav.students", to: "/students", icon: GraduationCap, group: "group_people", perm: "students.view" },
  { key: "nav.signups", to: "/signups", icon: UserPlus, group: "group_people", perm: "signups.view" },
  { key: "nav.teachers", to: "/teachers", icon: Users2, group: "group_people", perm: "teachers.view" },
  { key: "nav.substitutions", to: "/substitutions", icon: ArrowRightLeft, group: "group_people", perm: "substitutions.manage" },
  { key: "nav.users", to: "/users", icon: ShieldCheck, group: "group_people", perm: "users.view" },

  { key: "nav.reports", to: "/reports", icon: FileBarChart, group: "group_insights", perm: "reports.view" },
  { key: "nav.analytics", to: "/analytics", icon: LineChart, group: "group_insights", perm: "reports.view" },
  { key: "nav.announcements", to: "/announcements", icon: Megaphone, group: "group_insights", perm: "announcements.view" },

  { key: "nav.audit", to: "/audit", icon: ScrollText, group: "group_system", perm: "audit_logs.view" },
  { key: "nav.settings", to: "/settings", icon: Settings, group: "group_system", perm: "settings.manage" },
];

export const GROUP_ORDER = ["group_main", "group_academic", "group_people", "group_insights", "group_system"];
