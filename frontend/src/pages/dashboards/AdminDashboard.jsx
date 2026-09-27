import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";
import {
  Users2, GraduationCap, Building2, CalendarClock, TrendingUp, UserX, Clock,
  AlertTriangle, ClipboardCheck, UserPlus, Megaphone, FileBarChart, Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function Kpi({ icon: Icon, label, value, tone = "emerald", suffix, testid }) {
  const tones = {
    emerald: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400",
    rose: "text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-400",
    amber: "text-amber-600 bg-amber-100 dark:bg-amber-500/15 dark:text-amber-400",
    indigo: "text-indigo-600 bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-400",
    slate: "text-slate-600 bg-slate-100 dark:bg-slate-500/15 dark:text-slate-300",
  };
  return (
    <Card className="card-hover relative overflow-hidden p-5" data-testid={testid}>
      <div className={`kpi-accent-bar ${tones[tone].split(" ")[0].replace("text", "bg")}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-extrabold text-foreground">
            {value}
            {suffix && <span className="text-base font-bold text-muted-foreground">{suffix}</span>}
          </p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { t } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-admin"],
    queryFn: async () => (await api.get("/dashboard/admin")).data,
    refetchInterval: 60000,
  });

  const quickActions = [
    { label: "تسجيل الحضور", icon: ClipboardCheck, to: "/take-attendance", perm: "attendance.create" },
    { label: "إضافة طالب", icon: GraduationCap, to: "/students?new=1", perm: "students.create" },
    { label: "إضافة معلم", icon: UserPlus, to: "/teachers?new=1", perm: "teachers.create" },
    { label: "الهيكل الدراسي", icon: Building2, to: "/structure", perm: "structure.view" },
    { label: "إنشاء تقرير", icon: FileBarChart, to: "/reports", perm: "reports.view" },
    { label: "إرسال إعلان", icon: Megaphone, to: "/announcements?new=1", perm: "announcements.create" },
  ].filter((a) => can(a.perm));

  return (
    <div>
      <PageHeader
        title={t("nav.dashboard")}
        subtitle="نظرة شاملة على المدرسة والحضور اليوم"
        breadcrumb={t("group_main")}
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <div className="space-y-6">
          {/* Quick actions */}
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((a) => (
                <Button key={a.to} variant="outline" className="gap-2" onClick={() => navigate(a.to)}
                  data-testid={`quick-${a.to.replace(/[/?=]/g, "-")}`}>
                  <a.icon className="h-4 w-4" /> {a.label}
                </Button>
              ))}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi icon={GraduationCap} label="إجمالي الطلاب" value={data.kpis.total_students} tone="emerald" testid="kpi-students" />
            <Kpi icon={Users2} label="إجمالي المعلمين" value={data.kpis.total_teachers} tone="indigo" testid="kpi-teachers" />
            <Kpi icon={Building2} label="الشعب النشطة" value={data.kpis.active_sections} tone="slate" testid="kpi-sections" />
            <Kpi icon={CalendarClock} label="حصص اليوم" value={data.kpis.today_lessons} tone="amber" testid="kpi-lessons" />
            <Kpi icon={TrendingUp} label="نسبة الحضور اليوم" value={data.kpis.today_attendance_rate} suffix="%" tone="emerald" testid="kpi-rate" />
            <Kpi icon={UserX} label="غياب اليوم" value={data.kpis.today_absences} tone="rose" testid="kpi-absences" />
            <Kpi icon={Clock} label="متأخرون اليوم" value={data.kpis.today_late} tone="amber" testid="kpi-late" />
            <Kpi icon={AlertTriangle} label="معلمون لم يسجلوا" value={data.kpis.pending_teacher_count} tone="rose" testid="kpi-pending" />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h3 className="mb-4 text-lg font-bold">اتجاه الحضور الأسبوعي</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.weekly_trend}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="rate" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#rateGrad)" name="نسبة الحضور %" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-lg font-bold">مقارنة الشعب</h3>
              {data.class_comparison.length === 0 ? (
                <EmptyState hint="لا توجد بيانات حضور بعد" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.class_comparison} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="rate" radius={[0, 6, 6, 0]} name="نسبة %">
                      {data.class_comparison.map((e, i) => (
                        <Cell key={i} fill={e.rate >= 85 ? "hsl(var(--chart-1))" : e.rate >= 70 ? "hsl(var(--chart-2))" : "hsl(var(--chart-5))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Lists */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <UserX className="h-5 w-5 text-rose-500" /> الأكثر غيابًا
              </h3>
              {data.most_absent.length === 0 ? <EmptyState /> : (
                <div className="space-y-2">
                  {data.most_absent.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40 cursor-pointer"
                      onClick={() => navigate(`/students/${s.id}`)} data-testid={`absent-${s.id}`}>
                      <span className="font-medium">{s.full_name}</span>
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-sm font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
                        {s.absences} غياب
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> معلمون لم يسجلوا الحضور اليوم
              </h3>
              {data.pending_teachers.length === 0 ? (
                <EmptyState title="ممتاز! جميع المعلمين سجّلوا الحضور" />
              ) : (
                <div className="space-y-2">
                  {data.pending_teachers.map((tt) => (
                    <div key={tt.id} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="font-medium">{tt.full_name}</span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        {tt.pending} حصة
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
