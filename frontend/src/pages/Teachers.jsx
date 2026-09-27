import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSubjects, useSections, useGrades } from "@/lib/lookups";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, KeyRound, Users2, Search, Upload } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";

const EMPTY = { full_name: "", employee_id: "", email: "", phone: "", subject_ids: [], assigned_section_ids: [], create_account: false, username: "", password: "" };

function CheckList({ items, selected, onToggle, labelKey = "name", testid }) {
  return (
    <ScrollArea className="h-40 rounded-lg border p-2" data-testid={testid}>
      <div className="space-y-1">
        {items.map((it) => {
          const active = selected.includes(it.id);
          return (
            <label key={it.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? "bg-primary/10 font-semibold" : "hover:bg-muted"}`}>
              <input type="checkbox" checked={active} onChange={() => onToggle(it.id)} className="accent-emerald-600" />
              {it.grade_name ? `${it.grade_name} · ${it[labelKey]}` : it[labelKey]}
            </label>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function TeacherForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const { data: subjects = [] } = useSubjects();
  const { data: sections = [] } = useSections();

  useEffect(() => { setForm(editing ? { ...EMPTY, ...editing } : EMPTY); }, [editing, open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, id) => setForm((f) => ({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] }));

  const submit = async () => {
    if (!form.full_name) { toast.error("الاسم مطلوب"); return; }
    setLoading(true);
    try {
      if (editing) await api.patch(`/teachers/${editing.id}`, form);
      else await api.post("/teachers", form);
      toast.success("تم الحفظ"); onSaved(); onOpenChange(false);
    } catch (e) { toast.error(apiError(e)); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل معلم" : "إضافة معلم"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} data-testid="teacher-name" /></div>
          <div className="space-y-1.5"><Label>الرقم الوظيفي</Label><Input value={form.employee_id || ""} onChange={(e) => set("employee_id", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} data-testid="teacher-email" /></div>
          <div className="space-y-1.5"><Label>الهاتف</Label><Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>المواد</Label><CheckList items={subjects} selected={form.subject_ids} onToggle={(id) => toggle("subject_ids", id)} testid="teacher-subjects" /></div>
          <div className="space-y-1.5"><Label>الشعب المُسندة</Label><CheckList items={sections} selected={form.assigned_section_ids} onToggle={(id) => toggle("assigned_section_ids", id)} testid="teacher-sections" /></div>
          {!editing && (
            <div className="rounded-lg border p-3 sm:col-span-2">
              <label className="flex items-center justify-between"><span className="font-semibold">إنشاء حساب دخول للمعلم</span>
                <Switch checked={form.create_account} onCheckedChange={(v) => set("create_account", v)} data-testid="teacher-create-account" /></label>
              {form.create_account && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input placeholder="اسم المستخدم" value={form.username || ""} onChange={(e) => set("username", e.target.value)} />
                  <Input type="password" placeholder="كلمة المرور" value={form.password || ""} onChange={(e) => set("password", e.target.value)} />
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">سيتم إنشاء حساب بدور «معلم» ويُربط بالبريد أعلاه.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={loading} data-testid="teacher-save">{loading ? "..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Teachers() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => { const id = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(id); }, [search]);
  useEffect(() => { if (sp.get("new") && can("teachers.create")) { setEditing(null); setDialog(true); setSp({}); } }, [sp]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["teachers", debounced],
    queryFn: async () => (await api.get("/teachers", { params: { search: debounced || undefined, limit: 100 } })).data,
  });

  const del = async () => { try { await api.delete(`/teachers/${toDelete.id}`); toast.success("تم الحذف"); refetch(); } catch (e) { toast.error(apiError(e)); } setToDelete(null); };
  const resetPw = async (id) => {
    try { const { data } = await api.post(`/users/${id}/reset-password`); toast.success(`كلمة المرور الجديدة: ${data.temporary_password}`, { duration: 10000 }); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title={t("nav.teachers")} subtitle={`${data?.total ?? 0} معلم`} breadcrumb={t("group_people")}
        actions={can("teachers.create") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2" data-testid="import-teachers-btn"><Upload className="h-4 w-4" /> استيراد</Button>
            <Button onClick={() => { setEditing(null); setDialog(true); }} className="gap-2" data-testid="add-teacher-btn"><Plus className="h-4 w-4" /> إضافة معلم</Button>
          </div>
        )} />

      <Card className="mb-4 p-4">
        <div className="relative max-w-sm"><Search className="absolute top-2.5 h-4 w-4 text-muted-foreground start-3" />
          <Input placeholder="بحث بالاسم" value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" data-testid="teacher-search" /></div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={refetch} /> : data.items.length === 0 ? (
          <EmptyState title="لا يوجد معلمون" icon={Users2} hint="ابدأ بإضافة معلم" />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-start">الاسم</TableHead><TableHead className="text-start">الرقم الوظيفي</TableHead>
              <TableHead className="text-start">المواد</TableHead><TableHead className="text-start">الشعب</TableHead>
              <TableHead className="text-start">الحساب</TableHead><TableHead className="text-start">{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.items.map((tt) => (
                <TableRow key={tt.id} data-testid={`teacher-row-${tt.id}`}>
                  <TableCell className="font-semibold">{tt.full_name}</TableCell>
                  <TableCell>{tt.employee_id || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{(tt.subject_names || []).join("، ") || "-"}</TableCell>
                  <TableCell>{tt.section_count}</TableCell>
                  <TableCell>{tt.user_id ? <span className="text-emerald-600">مفعّل</span> : <span className="text-muted-foreground">بدون</span>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {can("teachers.edit") && <Button variant="ghost" size="icon" onClick={() => { setEditing(tt); setDialog(true); }} data-testid={`edit-teacher-${tt.id}`}><Pencil className="h-4 w-4" /></Button>}
                      {tt.user_id && can("users.edit") && <Button variant="ghost" size="icon" onClick={() => resetPw(tt.user_id)} title="إعادة تعيين كلمة المرور" data-testid={`reset-teacher-${tt.id}`}><KeyRound className="h-4 w-4" /></Button>}
                      {can("teachers.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => setToDelete(tt)} data-testid={`delete-teacher-${tt.id}`}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <TeacherForm open={dialog} onOpenChange={setDialog} editing={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["teachers"] })} />
      <ImportDialog type="teachers" open={importOpen} onOpenChange={setImportOpen} onDone={() => qc.invalidateQueries({ queryKey: ["teachers"] })} />
      <AlertDialog open={!!toDelete} onOpenChange={() => setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>حذف المعلم</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف {toDelete?.full_name}؟</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={del} className="bg-rose-600" data-testid="confirm-delete-teacher">حذف</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
