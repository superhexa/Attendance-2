import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ClipboardCheck, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";

export default function TeacherDashboard() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-teacher"],
    queryFn: async () => (await api.get("/dashboard/teacher")).data,
  });

  return (
    <div>
      <PageHeader title={t("nav.dashboard")} subtitle="حصصك اليوم وإحصائيات التسجيل" breadcrumb={t("group_main")} />
      {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-5"><p className="text-sm text-muted-foreground">حصص اليوم</p><p className="mt-1 text-3xl font-extrabold">{data.stats.today_total}</p></Card>
            <Card className="p-5"><p className="text-sm text-muted-foreground">تم تسجيلها</p><p className="mt-1 text-3xl font-extrabold text-emerald-600">{data.stats.today_submitted}</p></Card>
            <Card className="p-5"><p className="text-sm text-muted-foreground">بانتظار التسجيل</p><p className="mt-1 text-3xl font-extrabold text-amber-600">{data.stats.today_pending}</p></Card>
            <Card className="p-5"><p className="text-sm text-muted-foreground">نسبة الالتزام</p><p className="mt-1 text-3xl font-extrabold">{data.stats.submission_rate}%</p></Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarClock className="h-5 w-5 text-primary" /> جدول اليوم</h3>
            {data.today_lessons.length === 0 ? (
              <EmptyState title="لا توجد حصص اليوم" hint="استمتع بيومك!" />
            ) : (
              <div className="space-y-3">
                {data.today_lessons.map((l) => (
                  <div key={l.timetable_id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`lesson-${l.timetable_id}`}>
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <span className="text-[10px] font-bold">الحصة</span>
                        <span className="text-xl font-extrabold">{l.period}</span>
                      </div>
                      <div>
                        <p className="font-bold">{l.subject_name}</p>
                        <p className="text-sm text-muted-foreground">{l.grade_name} · {l.section_name} {l.classroom && `· ${l.classroom}`}</p>
                        <p className="text-xs text-muted-foreground">{l.start_time} - {l.end_time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {l.status === "locked" ? (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> تم التسجيل</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-600"><AlertCircle className="h-4 w-4" /> لم يُسجّل</span>
                      )}
                      <Button onClick={() => navigate(`/take-attendance?lesson=${l.timetable_id}&date=${l.date}`)}
                        className="gap-2 font-bold" data-testid={`take-${l.timetable_id}`}>
                        <ClipboardCheck className="h-4 w-4" /> {l.status === "locked" ? "عرض/تعديل" : "تسجيل الحضور"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
