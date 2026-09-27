import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog, Plus, Trash2, Loader2, Users, CalendarDays, Inbox, ArrowRightLeft } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

function CreateDialog({ open, onOpenChange, teachers, sections, subjects, onDone }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    original_teacher_id: "", substitute_teacher_id: "",
    section_id: "", subject_id: "", period: "", note: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.original_teacher_id || !form.substitute_teacher_id || !form.section_id || !form.date) {
      toast.error("جميع الحقول الأساسية مطلوبة"); return;
    }
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.subject_id) delete payload.subject_id;
      if (!payload.period) delete payload.period;
      else payload.period = +payload.period;
      await api.post("/substitutions", payload);
      toast.success("تم تعيين المعلم البديل");
      onDone(); onOpenChange(false);
      setForm({ date: new Date().toISOString().slice(0, 10),
        original_teacher_id: "", substitute_teacher_id: "",
        section_id: "", subject_id: "", period: "", note: "" });
    } catch (e) { toast.error(apiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ArrowRightLeft className="h-5 w-5 text-emerald-600" /> تعيين معلم بديل
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            المعلم البديل سيتمكن من تسجيل الحضور لهذه الشعبة مؤقتًا.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>التاريخ</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} data-testid="sub-date" />
          </div>
          <div className="space-y-1.5">
            <Label>المعلم الأصلي</Label>
            <Select value={form.original_teacher_id} onValueChange={(v) => set("original_teacher_id", v)}>
              <SelectTrigger data-testid="sub-original"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>المعلم البديل</Label>
            <Select value={form.substitute_teacher_id} onValueChange={(v) => set("substitute_teacher_id", v)}>
              <SelectTrigger data-testid="sub-substitute"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {teachers.filter((t) => t.id !== form.original_teacher_id).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>الشعبة</Label>
            <Select value={form.section_id} onValueChange={(v) => set("section_id", v)}>
              <SelectTrigger data-testid="sub-section"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.grade_name} - {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>الحصة (اختياري)</Label>
            <Input type="number" min="1" max="10" value={form.period} onChange={(e) => set("period", e.target.value)} placeholder="رقم الحصة" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>المادة (اختياري)</Label>
            <Select value={form.subject_id} onValueChange={(v) => set("subject_id", v)}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="سبب الغياب مثلاً..." />
          </div>
        </div>
        <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">إلغاء</Button>
          <Button onClick={submit} disabled={loading} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 sm:w-auto" data-testid="sub-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} تعيين
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Substitutions() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [openCreate, setOpenCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["substitutions", dateFilter],
    queryFn: async () => (await api.get("/substitutions", { params: { date: dateFilter } })).data,
  });
  const { data: teachersData } = useQuery({
    queryKey: ["teachers", "all"],
    queryFn: async () => (await api.get("/teachers", { params: { limit: 500 } })).data,
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections"], queryFn: async () => (await api.get("/sections")).data,
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"], queryFn: async () => (await api.get("/subjects")).data,
  });

  const teachers = useMemo(() => (teachersData?.items || []), [teachersData]);
  const items = data?.items || [];

  const cancel = async (id) => {
    if (!window.confirm("إلغاء هذا التعيين؟")) return;
    try {
      await api.delete(`/substitutions/${id}`);
      qc.invalidateQueries({ queryKey: ["substitutions"] });
      toast.success("تم الإلغاء");
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader
        title="المعلم البديل"
        subtitle="تعيين معلم بديل لحصة أو يوم — يحصل مؤقتًا على صلاحية تسجيل الحضور"
        breadcrumb={t("group_people")}
        actions={
          <Button onClick={() => setOpenCreate(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="sub-add">
            <Plus className="h-4 w-4" /> تعيين جديد
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Label className="whitespace-nowrap">التاريخ:</Label>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="max-w-xs" data-testid="sub-filter-date" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState /> : items.length === 0 ? (
        <EmptyState icon={Inbox} title="لا توجد تعيينات لهذا اليوم" hint="اضغط 'تعيين جديد' لإضافة معلم بديل." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it) => (
            <Card key={it.id} className="overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-l from-emerald-50 to-white pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{it.grade_name} · {it.section_name}</CardTitle>
                  <Badge className="bg-emerald-600">{it.date}{it.period ? ` · حصة ${it.period}` : ""}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-3 text-sm">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
                    <span className="flex items-center gap-2 text-slate-600"><UserCog className="h-4 w-4" /> الأصلي</span>
                    <span className="font-bold">{it.original_teacher_name || "—"}</span>
                  </div>
                  <div className="flex items-center justify-center text-emerald-600"><ArrowRightLeft className="h-4 w-4" /></div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2">
                    <span className="flex items-center gap-2 text-emerald-700"><UserCog className="h-4 w-4" /> البديل</span>
                    <span className="font-bold text-emerald-800">{it.substitute_teacher_name || "—"}</span>
                  </div>
                  {it.subject_name && (
                    <p className="text-xs text-slate-500">المادة: {it.subject_name}</p>
                  )}
                  {it.note && (
                    <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">{it.note}</p>
                  )}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => cancel(it.id)} className="gap-2 text-rose-600 hover:bg-rose-50" data-testid={`sub-cancel-${it.id}`}>
                    <Trash2 className="h-4 w-4" /> إلغاء
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        teachers={teachers}
        sections={sections}
        subjects={subjects}
        onDone={() => qc.invalidateQueries({ queryKey: ["substitutions"] })}
      />
    </div>
  );
}
