import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGrades, useSections, useSubjects, useTeachersList } from "@/lib/lookups";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, CalendarDays } from "lucide-react";

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const EMPTY = { day_of_week: 0, period: 1, start_time: "08:00", end_time: "08:45", subject_id: "", teacher_id: "", grade_id: "", section_id: "", classroom: "" };

export default function Timetable() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get("/settings")).data });
  const { data: years = [] } = useQuery({ queryKey: ["years"], queryFn: async () => (await api.get("/academic-years")).data });
  const activeYear = years.find((y) => y.is_active) || years[0];
  const { data: grades = [] } = useGrades();
  const { data: sections = [] } = useSections();
  const { data: subjects = [] } = useSubjects();
  const { data: teachersData } = useTeachersList();
  const teachers = teachersData?.items || [];

  const [mode, setMode] = useState("section"); // section | teacher
  const [filterId, setFilterId] = useState("");
  const periods = settings?.periods_count || 7;

  const params = {};
  if (activeYear) params.academic_year_id = activeYear.id;
  if (mode === "section" && filterId) params.section_id = filterId;
  if (mode === "teacher" && filterId) params.teacher_id = filterId;

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["timetable", mode, filterId, activeYear?.id],
    queryFn: async () => (await api.get("/timetable", { params })).data,
    enabled: !!filterId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openAdd = (day, period) => { setForm({ ...EMPTY, day_of_week: day ?? 0, period: period ?? 1, ...(mode === "section" && filterId ? { section_id: filterId } : {}), ...(mode === "teacher" && filterId ? { teacher_id: filterId } : {}) }); setOpen(true); };

  const save = async () => {
    if (!form.subject_id || !form.teacher_id || !form.grade_id || !form.section_id) { toast.error("يرجى تعبئة جميع الحقول"); return; }
    try {
      await api.post("/timetable", { ...form, academic_year_id: activeYear.id });
      toast.success("تمت الإضافة"); setOpen(false); qc.invalidateQueries({ queryKey: ["timetable"] });
    } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { await api.delete(`/timetable/${id}`); qc.invalidateQueries({ queryKey: ["timetable"] }); };

  const cell = (day, period) => entries.find((e) => e.day_of_week === day && e.period === period);
  const options = mode === "section" ? sections.map((s) => ({ id: s.id, name: `${s.grade_name} · ${s.name}` })) : teachers.map((tt) => ({ id: tt.id, name: tt.full_name }));

  return (
    <div>
      <PageHeader title={t("nav.timetable")} subtitle="الجدول الأسبوعي" breadcrumb={t("group_academic")}
        actions={can("timetable.create") && filterId && <Button onClick={() => openAdd()} className="gap-2" data-testid="add-timetable-btn"><Plus className="h-4 w-4" /> حصة</Button>} />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <Select value={mode} onValueChange={(v) => { setMode(v); setFilterId(""); }}>
          <SelectTrigger className="w-40" data-testid="timetable-mode"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="section">حسب الشعبة</SelectItem><SelectItem value="teacher">حسب المعلم</SelectItem></SelectContent></Select>
        <Select value={filterId} onValueChange={setFilterId}>
          <SelectTrigger className="w-64" data-testid="timetable-filter"><SelectValue placeholder={mode === "section" ? "اختر الشعبة" : "اختر المعلم"} /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select>
      </Card>

      {!filterId ? <Card><EmptyState title="اختر شعبة أو معلمًا لعرض الجدول" icon={CalendarDays} /></Card> : isLoading ? <LoadingState /> : (
        <Card className="overflow-x-auto p-2">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className="border-b p-3 text-sm font-bold text-muted-foreground">الحصة</th>
                {DAYS.map((d, i) => <th key={i} className="border-b p-3 text-sm font-bold">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periods }).map((_, pi) => {
                const period = pi + 1;
                return (
                  <tr key={period}>
                    <td className="border-b p-2 text-center text-sm font-bold text-muted-foreground">{period}</td>
                    {DAYS.map((_, day) => {
                      const e = cell(day, period);
                      return (
                        <td key={day} className="border-b border-s p-1.5 align-top">
                          {e ? (
                            <div className="group relative rounded-lg bg-primary/10 p-2 text-xs" data-testid={`tt-cell-${day}-${period}`}>
                              <p className="font-bold text-primary">{e.subject_name}</p>
                              <p className="text-muted-foreground">{mode === "section" ? e.teacher_name : e.section_name}</p>
                              {e.classroom && <p className="text-muted-foreground">{e.classroom}</p>}
                              {can("timetable.delete") && <button onClick={() => del(e.id)} className="absolute top-1 opacity-0 transition-opacity group-hover:opacity-100 end-1 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                            </div>
                          ) : can("timetable.create") ? (
                            <button onClick={() => openAdd(day, period)} className="flex h-full min-h-[52px] w-full items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted hover:text-primary" data-testid={`tt-add-${day}-${period}`}><Plus className="h-4 w-4" /></button>
                          ) : <div className="min-h-[52px]" />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>إضافة حصة للجدول</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>اليوم</Label>
              <Select value={String(form.day_of_week)} onValueChange={(v) => set("day_of_week", +v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>الحصة</Label><Input type="number" min="1" value={form.period} onChange={(e) => set("period", +e.target.value)} /></div>
            <div className="space-y-1.5"><Label>من</Label><Input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>إلى</Label><Input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>المادة</Label>
              <Select value={form.subject_id} onValueChange={(v) => set("subject_id", v)}><SelectTrigger data-testid="tt-subject"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>المعلم</Label>
              <Select value={form.teacher_id} onValueChange={(v) => set("teacher_id", v)}><SelectTrigger data-testid="tt-teacher"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{teachers.map((tt) => <SelectItem key={tt.id} value={tt.id}>{tt.full_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>الصف</Label>
              <Select value={form.grade_id} onValueChange={(v) => { set("grade_id", v); set("section_id", ""); }}><SelectTrigger data-testid="tt-grade"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>الشعبة</Label>
              <Select value={form.section_id} onValueChange={(v) => set("section_id", v)}><SelectTrigger data-testid="tt-section"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{sections.filter((s) => !form.grade_id || s.grade_id === form.grade_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>القاعة</Label><Input value={form.classroom} onChange={(e) => set("classroom", e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} data-testid="save-timetable">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
