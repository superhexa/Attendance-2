import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { useGrades, useSections } from "@/lib/lookups";
import { CalendarClock } from "lucide-react";

export default function AttendanceView() {
  const { t } = useLang();
  const { user } = useAuth();
  const isStudent = user?.role === "STUDENT";
  const { data: grades = [] } = useGrades();
  const [gradeId, setGradeId] = useState("all");
  const { data: sections = [] } = useSections(gradeId !== "all" ? { grade_id: gradeId } : {});
  const [sectionId, setSectionId] = useState("all");
  const [date, setDate] = useState("");

  const params = {};
  if (!isStudent) {
    if (sectionId !== "all") params.section_id = sectionId;
    if (date) params.date = date;
  }
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance-view", sectionId, date, isStudent],
    queryFn: async () => (await api.get("/attendance", { params })).data,
  });

  return (
    <div>
      <PageHeader title={t("nav.attendance")} subtitle={isStudent ? "سجل حضوري" : "استعراض سجلات الحضور"} breadcrumb={t("group_main")} />
      {!isStudent && (
        <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <Select value={gradeId} onValueChange={(v) => { setGradeId(v); setSectionId("all"); }}>
            <SelectTrigger data-testid="av-grade"><SelectValue placeholder="الصف" /></SelectTrigger>
            <SelectContent><SelectItem value="all">كل الصفوف</SelectItem>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
          <Select value={sectionId} onValueChange={setSectionId} disabled={gradeId === "all"}>
            <SelectTrigger data-testid="av-section"><SelectValue placeholder="الشعبة" /></SelectTrigger>
            <SelectContent><SelectItem value="all">كل الشعب</SelectItem>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <div><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="av-date" /></div>
        </Card>
      )}
      <Card className="overflow-hidden">
        {isLoading ? <LoadingState /> : records.length === 0 ? <EmptyState title="لا توجد سجلات" icon={CalendarClock} /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-start">{t("date")}</TableHead><TableHead className="text-start">المادة</TableHead>
              <TableHead className="text-start">المعلم</TableHead><TableHead className="text-start">{t("status")}</TableHead>
              <TableHead className="text-start">ملاحظة</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {records.slice(0, 200).map((r) => (
                <TableRow key={r.id} data-testid={`att-row-${r.id}`}>
                  <TableCell>{r.date}</TableCell><TableCell>{r.subject_name}</TableCell>
                  <TableCell>{r.teacher_name}</TableCell><TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{r.note || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
