import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGrades, useSections } from "@/lib/lookups";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, Eye, GraduationCap, Upload } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";

const EMPTY = { full_name: "", student_number: "", dob: "", gender: "male", grade_id: "", section_id: "", guardian_name: "", guardian_phone: "", contact_phone: "", email: "", create_account: false, username: "", password: "" };

function StudentForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const { data: grades = [] } = useGrades();
  const { data: sections = [] } = useSections(form.grade_id ? { grade_id: form.grade_id } : {});

  useEffect(() => { setForm(editing ? { ...EMPTY, ...editing } : EMPTY); }, [editing, open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name || !form.grade_id || !form.section_id) { toast.error("يرجى تعبئة الاسم والصف والشعبة"); return; }
    setLoading(true);
    try {
      if (editing) await api.patch(`/students/${editing.id}`, form);
      else await api.post("/students", form);
      toast.success("تم الحفظ"); onSaved(); onOpenChange(false);
    } catch (e) { toast.error(apiError(e)); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل طالب" : "إضافة طالب"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} data-testid="student-name" /></div>
          <div className="space-y-1.5"><Label>رقم الطالب</Label><Input value={form.student_number || ""} onChange={(e) => set("student_number", e.target.value)} data-testid="student-number" /></div>
          <div className="space-y-1.5"><Label>تاريخ الميلاد</Label><Input type="date" value={form.dob || ""} onChange={(e) => set("dob", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>الجنس</Label>
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}><SelectTrigger data-testid="student-gender"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="male">ذكر</SelectItem><SelectItem value="female">أنثى</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>الصف *</Label>
            <Select value={form.grade_id} onValueChange={(v) => { set("grade_id", v); set("section_id", ""); }}>
              <SelectTrigger data-testid="student-grade"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
              <SelectContent>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>الشعبة *</Label>
            <Select value={form.section_id} onValueChange={(v) => set("section_id", v)} disabled={!form.grade_id}>
              <SelectTrigger data-testid="student-section"><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
              <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>اسم ولي الأمر</Label><Input value={form.guardian_name || ""} onChange={(e) => set("guardian_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>هاتف ولي الأمر</Label><Input value={form.guardian_phone || ""} onChange={(e) => set("guardian_phone", e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
          {!editing && (
            <div className="rounded-lg border p-3 sm:col-span-2">
              <label className="flex items-center justify-between"><span className="font-semibold">إنشاء حساب دخول للطالب</span>
                <Switch checked={form.create_account} onCheckedChange={(v) => set("create_account", v)} data-testid="student-create-account" /></label>
              {form.create_account && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input placeholder="اسم المستخدم" value={form.username || ""} onChange={(e) => set("username", e.target.value)} />
                  <Input type="password" placeholder="كلمة المرور" value={form.password || ""} onChange={(e) => set("password", e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={loading} data-testid="student-save">{loading ? "..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Students() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [gradeId, setGradeId] = useState("all");
  const [sectionId, setSectionId] = useState("all");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => { const id = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(id); }, [search]);
  useEffect(() => { if (sp.get("new") && can("students.create")) { setEditing(null); setDialog(true); setSp({}); } }, [sp]);

  const { data: grades = [] } = useGrades();
  const { data: sections = [] } = useSections(gradeId !== "all" ? { grade_id: gradeId } : {});
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["students", debounced, gradeId, sectionId, page],
    queryFn: async () => (await api.get("/students", { params: {
      search: debounced || undefined, grade_id: gradeId !== "all" ? gradeId : undefined,
      section_id: sectionId !== "all" ? sectionId : undefined, page, limit: 15,
    } })).data,
  });

  const del = async () => { try { await api.delete(`/students/${toDelete.id}`); toast.success("تم الحذف"); refetch(); } catch (e) { toast.error(apiError(e)); } setToDelete(null); };
  const totalPages = Math.ceil((data?.total || 0) / 15);

  return (
    <div>
      <PageHeader title={t("nav.students")} subtitle={`${data?.total ?? 0} طالب`} breadcrumb={t("group_people")}
        actions={can("students.create") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2" data-testid="import-students-btn"><Upload className="h-4 w-4" /> استيراد</Button>
            <Button onClick={() => { setEditing(null); setDialog(true); }} className="gap-2" data-testid="add-student-btn"><Plus className="h-4 w-4" /> إضافة طالب</Button>
          </div>
        )} />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative"><Search className="absolute top-2.5 h-4 w-4 text-muted-foreground start-3" />
            <Input placeholder="بحث بالاسم أو الرقم" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="ps-9" data-testid="student-search" /></div>
          <Select value={gradeId} onValueChange={(v) => { setGradeId(v); setSectionId("all"); setPage(1); }}>
            <SelectTrigger data-testid="filter-grade"><SelectValue placeholder="الصف" /></SelectTrigger>
            <SelectContent><SelectItem value="all">كل الصفوف</SelectItem>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
          <Select value={sectionId} onValueChange={(v) => { setSectionId(v); setPage(1); }} disabled={gradeId === "all"}>
            <SelectTrigger data-testid="filter-section"><SelectValue placeholder="الشعبة" /></SelectTrigger>
            <SelectContent><SelectItem value="all">كل الشعب</SelectItem>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={refetch} /> : data.items.length === 0 ? (
          <EmptyState title="لا يوجد طلاب" icon={GraduationCap} hint="ابدأ بإضافة طالب جديد" />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-start">الاسم</TableHead><TableHead className="text-start">الرقم</TableHead>
              <TableHead className="text-start">الصف</TableHead><TableHead className="text-start">الشعبة</TableHead>
              <TableHead className="text-start">{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.items.map((s) => (
                <TableRow key={s.id} data-testid={`student-row-${s.id}`}>
                  <TableCell className="font-semibold">{s.full_name}</TableCell>
                  <TableCell>{s.student_number || "-"}</TableCell>
                  <TableCell>{s.grade_name}</TableCell>
                  <TableCell>{s.section_name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/students/${s.id}`)} data-testid={`view-student-${s.id}`}><Eye className="h-4 w-4" /></Button>
                      {can("students.edit") && <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setDialog(true); }} data-testid={`edit-student-${s.id}`}><Pencil className="h-4 w-4" /></Button>}
                      {can("students.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => setToDelete(s)} data-testid={`delete-student-${s.id}`}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
          <span className="text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
        </div>
      )}

      <StudentForm open={dialog} onOpenChange={setDialog} editing={editing} onSaved={() => { qc.invalidateQueries({ queryKey: ["students"] }); }} />
      <ImportDialog type="students" open={importOpen} onOpenChange={setImportOpen} onDone={() => qc.invalidateQueries({ queryKey: ["students"] })} />
      <AlertDialog open={!!toDelete} onOpenChange={() => setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>حذف الطالب</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف {toDelete?.full_name}؟ سيتم أرشفته.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={del} className="bg-rose-600" data-testid="confirm-delete-student">حذف</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
