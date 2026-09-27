import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, Trash2 } from "lucide-react";

const PRIORITY = { LOW: { l: "منخفض", c: "bg-slate-100 text-slate-600 dark:bg-slate-500/15" }, NORMAL: { l: "عادي", c: "bg-sky-100 text-sky-700 dark:bg-sky-500/15" }, HIGH: { l: "مهم", c: "bg-amber-100 text-amber-700 dark:bg-amber-500/15" }, URGENT: { l: "عاجل", c: "bg-rose-100 text-rose-700 dark:bg-rose-500/15" } };
const TARGET = { ALL: "الجميع", TEACHERS: "المعلمون", STUDENTS: "الطلاب" };
const EMPTY = { title: "", content: "", priority: "NORMAL", target_type: "ALL" };

export default function Announcements() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { data = [], isLoading } = useQuery({ queryKey: ["announcements"], queryFn: async () => (await api.get("/announcements")).data });

  useEffect(() => { if (sp.get("new") && can("announcements.create")) { setOpen(true); setSp({}); } }, [sp]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title || !form.content) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    try { await api.post("/announcements", form); toast.success("تم النشر"); setForm(EMPTY); setOpen(false); qc.invalidateQueries({ queryKey: ["announcements"] }); }
    catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { await api.delete(`/announcements/${id}`); qc.invalidateQueries({ queryKey: ["announcements"] }); };

  return (
    <div>
      <PageHeader title={t("nav.announcements")} subtitle="إعلانات المدرسة" breadcrumb={t("group_insights")}
        actions={can("announcements.create") && <Button onClick={() => setOpen(true)} className="gap-2" data-testid="add-announcement-btn"><Plus className="h-4 w-4" /> إعلان جديد</Button>} />
      {isLoading ? <LoadingState /> : data.length === 0 ? <Card><EmptyState title="لا توجد إعلانات" icon={Megaphone} /></Card> : (
        <div className="space-y-3">
          {data.map((a) => (
            <Card key={a.id} className="p-5" data-testid={`announcement-${a.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">{a.title}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY[a.priority]?.c}`}>{PRIORITY[a.priority]?.l}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{TARGET[a.target_type] || a.target_type}</span>
                  </div>
                  <p className="text-sm text-foreground">{a.content}</p>
                  <p className="text-xs text-muted-foreground">{a.created_by_name} · {new Date(a.created_at).toLocaleString("ar")}</p>
                </div>
                {can("announcements.delete") && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(a.id)} data-testid={`delete-announcement-${a.id}`}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>إعلان جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>العنوان</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="announcement-title" /></div>
            <div className="space-y-1.5"><Label>المحتوى</Label><Textarea value={form.content} onChange={(e) => set("content", e.target.value)} data-testid="announcement-content" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>الأولوية</Label>
                <Select value={form.priority} onValueChange={(v) => set("priority", v)}><SelectTrigger data-testid="announcement-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>الجمهور المستهدف</Label>
                <Select value={form.target_type} onValueChange={(v) => set("target_type", v)}><SelectTrigger data-testid="announcement-target"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TARGET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} data-testid="save-announcement">نشر</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
