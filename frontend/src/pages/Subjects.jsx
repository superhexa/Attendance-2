import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGrades } from "@/lib/lookups";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";

const EMPTY = { name: "", code: "", weekly_periods: 0, grade_ids: [] };

export default function Subjects() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: subjects = [], isLoading } = useQuery({ queryKey: ["subjects"], queryFn: async () => (await api.get("/subjects")).data });
  const { data: grades = [] } = useGrades();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { setForm(editing ? { ...EMPTY, ...editing } : EMPTY); }, [editing, open]);
  const toggleGrade = (id) => setForm((f) => ({ ...f, grade_ids: f.grade_ids.includes(id) ? f.grade_ids.filter((x) => x !== id) : [...f.grade_ids, id] }));

  const save = async () => {
    if (!form.name) { toast.error("الاسم مطلوب"); return; }
    try {
      if (editing) await api.patch(`/subjects/${editing.id}`, form); else await api.post("/subjects", form);
      toast.success("تم الحفظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["subjects"] });
    } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { await api.delete(`/subjects/${id}`); qc.invalidateQueries({ queryKey: ["subjects"] }); };

  return (
    <div>
      <PageHeader title={t("nav.subjects")} subtitle={`${subjects.length} مادة`} breadcrumb={t("group_academic")}
        actions={can("subjects.create") && <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-2" data-testid="add-subject-btn"><Plus className="h-4 w-4" /> إضافة مادة</Button>} />
      <Card className="overflow-hidden">
        {isLoading ? <LoadingState /> : subjects.length === 0 ? <EmptyState title="لا توجد مواد" icon={BookOpen} /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-start">المادة</TableHead><TableHead className="text-start">الرمز</TableHead>
              <TableHead className="text-start">الحصص الأسبوعية</TableHead><TableHead className="text-start">{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {subjects.map((s) => (
                <TableRow key={s.id} data-testid={`subject-row-${s.id}`}>
                  <TableCell className="font-semibold">{s.name}</TableCell>
                  <TableCell>{s.code || "-"}</TableCell>
                  <TableCell>{s.weekly_periods || "-"}</TableCell>
                  <TableCell><div className="flex gap-1">
                    {can("subjects.edit") && <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }} data-testid={`edit-subject-${s.id}`}><Pencil className="h-4 w-4" /></Button>}
                    {can("subjects.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(s.id)} data-testid={`delete-subject-${s.id}`}><Trash2 className="h-4 w-4" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "تعديل مادة" : "إضافة مادة"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>اسم المادة</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="subject-name" /></div>
              <div className="space-y-1.5"><Label>الرمز</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>الحصص الأسبوعية</Label><Input type="number" value={form.weekly_periods} onChange={(e) => setForm((f) => ({ ...f, weekly_periods: +e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>الصفوف</Label>
              <ScrollArea className="h-36 rounded-lg border p-2">
                {grades.map((g) => (
                  <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={form.grade_ids.includes(g.id)} onChange={() => toggleGrade(g.id)} className="accent-emerald-600" /> {g.name}
                  </label>
                ))}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} data-testid="save-subject">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
