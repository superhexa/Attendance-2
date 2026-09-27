import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TrendingUp, UserX, FileText, Clock, CalendarClock, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";

export default function StudentDashboard() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-student"],
    queryFn: async () => (await api.get("/dashboard/student")).data,
  });

  return (
    <div>
      <PageHeader title="لوحتي" subtitle={data?.student?.full_name} breadcrumb={t("group_main")} />
      {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-6">
          <Card className="overflow-hidden p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium text-muted-foreground">نسبة الحضور الإجمالية</p>
              <p className="text-6xl font-extrabold text-emerald-600">{data.stats.attendance_rate}%</p>
              <Progress value={data.stats.attendance_rate} className="h-3 w-full max-w-md" />
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5 text-center"><UserX className="mx-auto mb-2 h-6 w-6 text-rose-500" /><p className="text-2xl font-extrabold">{data.stats.total_absences}</p><p className="text-xs text-muted-foreground">غياب</p></Card>
            <Card className="p-5 text-center"><FileText className="mx-auto mb-2 h-6 w-6 text-indigo-500" /><p className="text-2xl font-extrabold">{data.stats.excused}</p><p className="text-xs text-muted-foreground">بعذر</p></Card>
            <Card className="p-5 text-center"><Clock className="mx-auto mb-2 h-6 w-6 text-amber-500" /><p className="text-2xl font-extrabold">{data.stats.late}</p><p className="text-xs text-muted-foreground">تأخر</p></Card>
          </div>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><CalendarClock className="h-5 w-5 text-primary" /> حصص اليوم</h3>
              <Button variant="outline" size="sm" onClick={() => navigate("/attendance")} data-testid="attendance-details-btn">
                تفاصيل الحضور <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            {data.today_classes.length === 0 ? (
              <EmptyState title="لا توجد حصص اليوم" />
            ) : (
              <div className="divide-y">
                {data.today_classes.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-3" data-testid={`class-${i}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-sm font-bold">{c.period}</span>
                      <div>
                        <p className="font-semibold">{c.subject_name}</p>
                        <p className="text-xs text-muted-foreground">{c.start_time}</p>
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
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
