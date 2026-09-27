import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGrades, useSections } from "@/lib/lookups";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, CheckCircle2, CalendarRange, Layers, Building2, ArrowUpNarrowWide } from "lucide-react";

function Years() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: years = [], isLoading } = useQuery({ queryKey: ["years"], queryFn: async () => (await api.get("/academic-years")).data });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const add = async () => { try { await api.post("/academic-years", { name }); toast.success("تمت الإضافة"); setName(""); setOpen(false); qc.invalidateQueries({ queryKey: ["years"] }); } catch (e) { toast.error(apiError(e)); } };
  const activate = async (id) => { await api.post(`/academic-years/${id}/activate`); qc.invalidateQueries({ queryKey: ["years"] }); toast.success("تم التفعيل"); };
  const del = async (id) => { await api.delete(`/academic-years/${id}`); qc.invalidateQueries({ queryKey: ["years"] }); };

  return (
    <div className="space-y-4">
      {can("structure.create") && <Button onClick={() => setOpen(true)} className="gap-2" data-testid="add-year-btn"><Plus className="h-4 w-4" /> عام دراسي</Button>}
      {isLoading ? <LoadingState /> : years.length === 0 ? <Card><EmptyState title="لا توجد أعوام دراسية" icon={CalendarRange} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {years.map((y) => (
            <Card key={y.id} className={`p-4 ${y.is_active ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""}`} data-testid={`year-${y.id}`}>
              <div className="flex items-center justify-between">
                <div><p className="text-lg font-bold">{y.name}</p>{y.is_active && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> نشط</span>}</div>
                <div className="flex gap-1">
                  {!y.is_active && can("structure.edit") && <Button variant="outline" size="sm" onClick={() => activate(y.id)} data-testid={`activate-${y.id}`}>تفعيل</Button>}
                  {can("structure.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(y.id)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>إضافة عام دراسي</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026/2027" data-testid="year-name" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={add} data-testid="save-year">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grades() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: years = [] } = useQuery({ queryKey: ["years"], queryFn: async () => (await api.get("/academic-years")).data });
  const activeYear = years.find((y) => y.is_active) || years[0];
  const { data: grades = [], isLoading } = useGrades(activeYear?.id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", level: 1 });
  const add = async () => { try { await api.post("/grades", { ...form, academic_year_id: activeYear.id }); toast.success("تمت الإضافة"); setForm({ name: "", level: 1 }); setOpen(false); qc.invalidateQueries({ queryKey: ["grades"] }); } catch (e) { toast.error(apiError(e)); } };
  const del = async (id) => { await api.delete(`/grades/${id}`); qc.invalidateQueries({ queryKey: ["grades"] }); };

  if (!activeYear) return <Card><EmptyState title="أضف عامًا دراسيًا أولًا" /></Card>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">العام: <span className="font-bold text-foreground">{activeYear.name}</span></p>
        {can("structure.create") && <Button onClick={() => setOpen(true)} className="gap-2" data-testid="add-grade-btn"><Plus className="h-4 w-4" /> صف</Button>}
      </div>
      {isLoading ? <LoadingState /> : grades.length === 0 ? <Card><EmptyState title="لا توجد صفوف" icon={Layers} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grades.map((g) => (
            <Card key={g.id} className="flex items-center justify-between p-4" data-testid={`grade-${g.id}`}>
              <span className="font-bold">{g.name}</span>
              {can("structure.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(g.id)}><Trash2 className="h-4 w-4" /></Button>}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>إضافة صف</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>اسم الصف</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="الصف الأول الثانوي" data-testid="grade-name" /></div>
            <div className="space-y-1.5"><Label>المستوى (ترتيب)</Label><Input type="number" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: +e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={add} data-testid="save-grade">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionsTab() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: grades = [] } = useGrades();
  const [gradeId, setGradeId] = useState("");
  const { data: sections = [], isLoading } = useSections(gradeId ? { grade_id: gradeId } : {});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", capacity: 40 });
  const grade = grades.find((g) => g.id === gradeId);
  const add = async () => { try { await api.post("/sections", { ...form, grade_id: gradeId, academic_year_id: grade.academic_year_id }); toast.success("تمت الإضافة"); setForm({ name: "", capacity: 40 }); setOpen(false); qc.invalidateQueries({ queryKey: ["sections"] }); } catch (e) { toast.error(apiError(e)); } };
  const del = async (id) => { try { await api.delete(`/sections/${id}`); qc.invalidateQueries({ queryKey: ["sections"] }); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={gradeId} onValueChange={setGradeId}>
          <SelectTrigger className="w-64" data-testid="section-grade-select"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
          <SelectContent>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
        {gradeId && can("structure.create") && <Button onClick={() => setOpen(true)} className="gap-2" data-testid="add-section-btn"><Plus className="h-4 w-4" /> شعبة</Button>}
      </div>
      {!gradeId ? <Card><EmptyState title="اختر صفًا لعرض شعبه" icon={Building2} /></Card> : isLoading ? <LoadingState /> : sections.length === 0 ? <Card><EmptyState title="لا توجد شعب" icon={Building2} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <Card key={s.id} className="flex items-center justify-between p-4" data-testid={`section-${s.id}`}>
              <div><p className="font-bold">{s.name}</p><p className="text-xs text-muted-foreground">{s.student_count} طالب · سعة {s.capacity}</p></div>
              {can("structure.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></Button>}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>إضافة شعبة</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>اسم الشعبة</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="شعبة أ" data-testid="section-name" /></div>
            <div className="space-y-1.5"><Label>السعة</Label><Input type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: +e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={add} data-testid="save-section">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Promotion() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ["promotion"], queryFn: async () => (await api.get("/promotion/preview")).data });
  const { data: grades = [] } = useGrades();
  const { data: sections = [] } = useSections();
  const [plan, setPlan] = useState({});
  const [confirm, setConfirm] = useState(false);
  const setRow = (gid, patch) => setPlan((p) => ({ ...p, [gid]: { ...(p[gid] || { action: "none" }), ...patch } }));
  const apply = async () => {
    const mappings = Object.entries(plan).filter(([, v]) => v.action && v.action !== "none")
      .map(([from_grade_id, v]) => ({ from_grade_id, action: v.action, to_grade_id: v.to_grade_id || null, to_section_id: v.to_section_id || null }));
    if (!mappings.length) { toast.error("لم تحدد أي ترقية"); setConfirm(false); return; }
    try {
      const { data: res } = await api.post("/promotion/apply", { mappings });
      toast.success(`تمت ترقية ${res.promoted} طالبًا وتخريج ${res.graduated}`);
      setPlan({}); setConfirm(false); refetch(); qc.invalidateQueries({ queryKey: ["students"] });
    } catch (e) { toast.error(apiError(e)); }
  };
  const grds = data?.grades || [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">العام النشط: <b className="text-foreground">{data?.active_year || "-"}</b> — حدّد وجهة كل صف ثم طبّق الترقية بضغطة واحدة.</p>
      <Card className="overflow-hidden">
        {grds.length === 0 ? <EmptyState title="لا توجد صفوف" icon={Layers} /> : (
          <div className="divide-y">
            {grds.map((g) => {
              const row = plan[g.grade_id] || { action: "none" };
              const targetSections = sections.filter((s) => s.grade_id === row.to_grade_id);
              return (
                <div key={g.grade_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid={`promote-row-${g.grade_id}`}>
                  <div className="min-w-[190px]"><p className="font-bold">{g.grade_name}</p><p className="text-xs text-muted-foreground">{g.student_count} طالب</p></div>
                  <Select value={row.action} onValueChange={(v) => setRow(g.grade_id, { action: v, to_grade_id: undefined, to_section_id: undefined })}>
                    <SelectTrigger className="w-44" data-testid={`promote-action-${g.grade_id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون تغيير</SelectItem>
                      <SelectItem value="promote">ترقية إلى صف</SelectItem>
                      <SelectItem value="graduate">تخريج / أرشفة</SelectItem>
                    </SelectContent>
                  </Select>
                  {row.action === "promote" && (
                    <>
                      <Select value={row.to_grade_id || ""} onValueChange={(v) => setRow(g.grade_id, { to_grade_id: v, to_section_id: undefined })}>
                        <SelectTrigger className="w-48" data-testid={`promote-target-${g.grade_id}`}><SelectValue placeholder="الصف الهدف" /></SelectTrigger>
                        <SelectContent>{grades.filter((x) => x.id !== g.grade_id).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={row.to_section_id || ""} onValueChange={(v) => setRow(g.grade_id, { to_section_id: v })} disabled={!row.to_grade_id}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="الشعبة (اختياري)" /></SelectTrigger>
                        <SelectContent>{targetSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Button onClick={() => setConfirm(true)} className="gap-2" data-testid="apply-promotion-btn"><ArrowUpNarrowWide className="h-4 w-4" /> تطبيق الترقية</Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>تأكيد الترقية السنوية</AlertDialogTitle><AlertDialogDescription>سيتم نقل أو تخريج الطلاب حسب الخطة المحددة. تأكد من صحة الوجهات قبل المتابعة.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={apply} className="bg-emerald-600" data-testid="confirm-promotion">تطبيق</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Structure() {
  const { t } = useLang();
  const { can } = useAuth();
  const showPromotion = can("students.edit");
  return (
    <div>
      <PageHeader title={t("nav.structure")} subtitle="الأعوام الدراسية، الصفوف، والشعب" breadcrumb={t("group_academic")} />
      <Tabs defaultValue="years">
        <TabsList className="mb-4">
          <TabsTrigger value="years" data-testid="tab-years">الأعوام الدراسية</TabsTrigger>
          <TabsTrigger value="grades" data-testid="tab-grades">الصفوف</TabsTrigger>
          <TabsTrigger value="sections" data-testid="tab-sections">الشعب</TabsTrigger>
          {showPromotion && <TabsTrigger value="promotion" data-testid="tab-promotion">الترقية والتخريج</TabsTrigger>}
        </TabsList>
        <TabsContent value="years"><Years /></TabsContent>
        <TabsContent value="grades"><Grades /></TabsContent>
        <TabsContent value="sections"><SectionsTab /></TabsContent>
        {showPromotion && <TabsContent value="promotion"><Promotion /></TabsContent>}
      </Tabs>
    </div>
  );
}
