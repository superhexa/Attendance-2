import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, User } from "lucide-react";

export default function StudentDetail() {
  const { id } = useParams();
  const { t } = useLang();
  const navigate = useNavigate();
  const { data: student, isLoading, isError, refetch } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => (await api.get(`/students/${id}`)).data,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["student-attendance", id],
    queryFn: async () => (await api.get("/attendance", { params: { student_id: id } })).data,
    enabled: !!student,
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const s = student.stats;
  const risk = s.attendance_rate >= 90 ? { l: "منخفض", c: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15" }
    : s.attendance_rate >= 80 ? { l: "متوسط", c: "text-amber-600 bg-amber-100 dark:bg-amber-500/15" }
    : s.attendance_rate >= 70 ? { l: "مرتفع", c: "text-orange-600 bg-orange-100 dark:bg-orange-500/15" }
    : { l: "حرج", c: "text-rose-600 bg-rose-100 dark:bg-rose-500/15" };

  return (
    <div>
      <PageHeader title={student.full_name} subtitle={`${student.grade_name} · ${student.section_name}`} breadcrumb={t("nav.students")}
        actions={<Button variant="outline" onClick={() => navigate("/students")} className="gap-2"><ArrowRight className="h-4 w-4" /> رجوع</Button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> البيانات</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row k="رقم الطالب" v={student.student_number || "-"} />
            <Row k="تاريخ الميلاد" v={student.dob || "-"} />
            <Row k="ولي الأمر" v={student.guardian_name || "-"} />
            <Row k="هاتف ولي الأمر" v={student.guardian_phone || "-"} />
            <Row k="البريد" v={student.email || "-"} />
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground">مؤشر خطر الحضور</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${risk.c}`}>{risk.l}</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-semibold">نسبة الحضور</span>
                <span className="text-2xl font-extrabold text-emerald-600">{s.attendance_rate}%</span>
              </div>
              <Progress value={s.attendance_rate} className="h-2.5" />
              <div className="mt-5 grid grid-cols-3 gap-3 text-center sm:grid-cols-5">
                <Stat n={s.present} l="حاضر" c="text-emerald-600" />
                <Stat n={s.absent} l="غائب" c="text-rose-600" />
                <Stat n={s.late} l="متأخر" c="text-amber-600" />
                <Stat n={s.excused} l="بعذر" c="text-indigo-600" />
                <Stat n={s.left_early} l="خروج مبكر" c="text-cyan-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>سجل الحضور</CardTitle></CardHeader>
            {history.length === 0 ? <EmptyState title="لا يوجد سجل حضور" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-start">{t("date")}</TableHead><TableHead className="text-start">المادة</TableHead>
                  <TableHead className="text-start">المعلم</TableHead><TableHead className="text-start">{t("status")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {history.slice(0, 50).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell><TableCell>{r.subject_name}</TableCell>
                      <TableCell>{r.teacher_name}</TableCell><TableCell><StatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => <div className="flex items-center justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
const Stat = ({ n, l, c }) => <div><p className={`text-xl font-extrabold ${c}`}>{n}</p><p className="text-xs text-muted-foreground">{l}</p></div>;
