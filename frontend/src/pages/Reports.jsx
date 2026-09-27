import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGrades, useSections, useSubjects } from "@/lib/lookups";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Download, FileBarChart, Printer } from "lucide-react";

export default function Reports() {
  const { t } = useLang();
  const { can } = useAuth();
  const { data: grades = [] } = useGrades();
  const [gradeId, setGradeId] = useState("all");
  const { data: sections = [] } = useSections(gradeId !== "all" ? { grade_id: gradeId } : {});
  const { data: subjects = [] } = useSubjects();
  const [f, setF] = useState({ date_from: "", date_to: "", section_id: "all", subject_id: "all", status: "all" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const buildParams = () => {
    const p = {};
    if (f.date_from) p.date_from = f.date_from;
    if (f.date_to) p.date_to = f.date_to;
    if (gradeId !== "all") p.grade_id = gradeId;
    if (f.section_id !== "all") p.section_id = f.section_id;
    if (f.subject_id !== "all") p.subject_id = f.subject_id;
    if (f.status !== "all") p.status = f.status;
    return p;
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["report", gradeId, f],
    queryFn: async () => (await api.get("/reports/attendance", { params: buildParams() })).data,
  });

  const exportCsv = async () => {
    try {
      const res = await api.get("/reports/attendance/export", { params: buildParams(), responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "attendance_report.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير التقرير");
    } catch (e) { toast.error(apiError(e)); }
  };

  const exportPdf = async () => {
    try {
      const res = await api.get("/reports/attendance/pdf", { params: buildParams(), responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "attendance_report.pdf"; a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير PDF");
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title={t("nav.reports")} subtitle="تقارير الحضور القابلة للتصفية والتصدير" breadcrumb={t("group_insights")}
        actions={<div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="print-report"><Printer className="h-4 w-4" /> طباعة</Button>
          {can("reports.export") && <Button variant="outline" onClick={exportCsv} className="gap-2" data-testid="export-report"><Download className="h-4 w-4" /> CSV</Button>}
          {can("reports.export") && <Button onClick={exportPdf} className="gap-2" data-testid="export-pdf"><FileBarChart className="h-4 w-4" /> PDF</Button>}
        </div>} />

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1"><Label className="text-xs">من تاريخ</Label><Input type="date" value={f.date_from} onChange={(e) => set("date_from", e.target.value)} data-testid="report-from" /></div>
        <div className="space-y-1"><Label className="text-xs">إلى تاريخ</Label><Input type="date" value={f.date_to} onChange={(e) => set("date_to", e.target.value)} data-testid="report-to" /></div>
        <div className="space-y-1"><Label className="text-xs">الصف</Label>
          <Select value={gradeId} onValueChange={(v) => { setGradeId(v); set("section_id", "all"); }}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الكل</SelectItem>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">الشعبة</Label>
          <Select value={f.section_id} onValueChange={(v) => set("section_id", v)} disabled={gradeId === "all"}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الكل</SelectItem>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">المادة</Label>
          <Select value={f.subject_id} onValueChange={(v) => set("subject_id", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الكل</SelectItem>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">الحالة</Label>
          <Select value={f.status} onValueChange={(v) => set("status", v)}><SelectTrigger data-testid="report-status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الكل</SelectItem>{["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEFT_EARLY"].map((s) => <SelectItem key={s} value={s}>{t(s)}</SelectItem>)}</SelectContent></Select></div>
      </Card>

      {isLoading || isFetching ? <LoadingState /> : !data ? null : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Card className="p-4 text-center"><p className="text-2xl font-extrabold">{data.total}</p><p className="text-xs text-muted-foreground">سجل</p></Card>
            <Card className="p-4 text-center"><p className="text-2xl font-extrabold text-emerald-600">{data.attendance_rate}%</p><p className="text-xs text-muted-foreground">نسبة الحضور</p></Card>
            {Object.entries(data.summary).map(([k, v]) => (
              <Card key={k} className="p-4 text-center"><p className="text-2xl font-extrabold">{v}</p><p className="text-xs text-muted-foreground">{t(k)}</p></Card>
            ))}
          </div>
          <Card className="overflow-hidden">
            {data.rows.length === 0 ? <EmptyState title="لا توجد بيانات مطابقة" icon={FileBarChart} /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-start">{t("date")}</TableHead><TableHead className="text-start">الطالب</TableHead>
                  <TableHead className="text-start">المادة</TableHead><TableHead className="text-start">المعلم</TableHead>
                  <TableHead className="text-start">{t("status")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.rows.slice(0, 300).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.date}</TableCell><TableCell className="font-medium">{r.student_name}</TableCell>
                      <TableCell>{r.subject_name}</TableCell><TableCell>{r.teacher_name}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
