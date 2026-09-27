import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  UserCheck, UserX, Loader2, Clock, IdCard, Users, Building2, Mail, Phone,
  CalendarDays, Trash2, RefreshCw, Inbox, ShieldCheck,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

function timeAgo(ts) {
  try {
    const d = new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "الآن";
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return d.toLocaleDateString("ar");
  } catch (e) { return ""; }
}

function ApproveDialog({ open, onOpenChange, signup, grades, sections, onDone }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (signup) {
      const d = signup.signup_data || {};
      setForm({
        full_name: signup.full_name || "",
        student_number: d.student_number || "",
        grade_id: d.grade_id || "",
        section_id: d.section_id || "",
        dob: d.dob || "",
        gender: d.gender || "male",
        guardian_name: d.guardian_name || "",
        guardian_phone: d.guardian_phone || "",
        contact_phone: d.contact_phone || "",
      });
    }
  }, [signup]);

  const sectionsForGrade = useMemo(() => (
    sections.filter((s) => s.grade_id === form.grade_id)
  ), [sections, form.grade_id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.grade_id || !form.section_id) {
      toast.error("اختر الصف والشعبة"); return;
    }
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.student_number) delete payload.student_number;
      await api.post(`/signups/${signup.user_id}/approve`, payload);
      toast.success(`تم اعتماد حساب ${form.full_name}`);
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally { setLoading(false); }
  };

  if (!signup) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            اعتماد حساب الطالب
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            راجع البيانات وعدّل ما يلزم قبل التفعيل. سيتمكن الطالب من تسجيل الدخول فور الاعتماد.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>الاسم الكامل</Label>
            <Input value={form.full_name || ""} onChange={(e) => set("full_name", e.target.value)} data-testid="approve-full-name" />
          </div>
          <div className="space-y-1.5">
            <Label>رقم الطالب</Label>
            <Input value={form.student_number || ""} onChange={(e) => set("student_number", e.target.value)} placeholder="اختياري" data-testid="approve-student-number" />
          </div>
          <div className="space-y-1.5">
            <Label>تاريخ الميلاد</Label>
            <Input type="date" value={form.dob || ""} onChange={(e) => set("dob", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>الصف</Label>
            <Select value={form.grade_id} onValueChange={(v) => { set("grade_id", v); set("section_id", ""); }}>
              <SelectTrigger data-testid="approve-grade"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>الشعبة</Label>
            <Select value={form.section_id} onValueChange={(v) => set("section_id", v)} disabled={!form.grade_id}>
              <SelectTrigger data-testid="approve-section"><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
              <SelectContent>
                {sectionsForGrade.length ? sectionsForGrade.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>) :
                  <SelectItem value="none" disabled>لا شعب لهذا الصف</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>الجنس</Label>
            <Select value={form.gender || "male"} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">ذكر</SelectItem>
                <SelectItem value="female">أنثى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>اسم ولي الأمر</Label>
            <Input value={form.guardian_name || ""} onChange={(e) => set("guardian_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>رقم ولي الأمر</Label>
            <Input value={form.guardian_phone || ""} onChange={(e) => set("guardian_phone", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>هاتف الطالب</Label>
            <Input value={form.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} />
          </div>
        </div>

        <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">إلغاء</Button>
          <Button onClick={submit} disabled={loading} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 sm:w-auto" data-testid="approve-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            اعتماد وتفعيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onOpenChange, signup, onDone }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => { if (open) setReason(""); }, [open]);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/signups/${signup.user_id}/reject`, { reason });
      toast.success("تم رفض الطلب");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally { setLoading(false); }
  };

  if (!signup) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-rose-600" /> رفض طلب التسجيل
          </DialogTitle>
          <DialogDescription>سيتم رفض حساب {signup.full_name}. يمكنك تسجيل السبب.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>سبب الرفض (اختياري)</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: بيانات غير صحيحة" data-testid="reject-reason" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={loading} className="gap-2 bg-rose-600 hover:bg-rose-700" data-testid="reject-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} رفض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignupCard({ item, onApprove, onReject, onDelete, showActions = true }) {
  const d = item.signup_data || {};
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg" data-testid={`signup-${item.user_id}`}>
      <CardHeader className="border-b bg-gradient-to-l from-emerald-50 to-white pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{item.full_name}</CardTitle>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {item.email}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(item.created_at)}</span>
            </p>
          </div>
          <Badge variant={item.status === "pending_approval" ? "secondary" : item.status === "rejected" ? "destructive" : "default"} className="font-bold">
            {item.status === "pending_approval" ? "بانتظار الموافقة" : item.status === "rejected" ? "مرفوض" : "مفعّل"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 text-slate-700">
            <Building2 className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">الصف:</span>
            <span>{item.grade_name || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <Users className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">الشعبة:</span>
            <span>{item.section_name || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <IdCard className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">رقم الطالب:</span>
            <span>{d.student_number || "لم يُدخل"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">تاريخ الميلاد:</span>
            <span>{d.dob || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <Users className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">ولي الأمر:</span>
            <span>{d.guardian_name || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <Phone className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">هاتف ولي الأمر:</span>
            <span>{d.guardian_phone || "—"}</span>
          </div>
        </div>
        {item.reject_reason && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <span className="font-bold">سبب الرفض: </span>{item.reject_reason}
          </div>
        )}
        {showActions && item.status === "pending_approval" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => onApprove(item)} data-testid={`approve-${item.user_id}`}>
              <UserCheck className="h-4 w-4" /> اعتماد
            </Button>
            <Button variant="outline" className="flex-1 gap-2 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => onReject(item)} data-testid={`reject-${item.user_id}`}>
              <UserX className="h-4 w-4" /> رفض
            </Button>
          </div>
        )}
        {showActions && item.status === "rejected" && (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" className="gap-2 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(item)} data-testid={`delete-${item.user_id}`}>
              <Trash2 className="h-4 w-4" /> حذف نهائي
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PendingSignups() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const canApprove = can("signups.approve");

  const { data: pending, isLoading: loadingPending, refetch: refetchPending } = useQuery({
    queryKey: ["signups", "pending"],
    queryFn: async () => (await api.get("/signups/pending")).data,
    refetchInterval: 15000,
  });
  const { data: rejected, isLoading: loadingRejected } = useQuery({
    queryKey: ["signups", "rejected"],
    queryFn: async () => (await api.get("/signups/history", { params: { status: "rejected" } })).data,
    enabled: tab === "rejected",
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["grades"],
    queryFn: async () => (await api.get("/grades")).data,
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await api.get("/sections")).data,
  });

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["signups"] });
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["users"] });
  };

  const onDelete = async (item) => {
    if (!window.confirm(`حذف طلب ${item.full_name} نهائيًا؟`)) return;
    try {
      await api.delete(`/signups/${item.user_id}`);
      toast.success("تم الحذف");
      onDone();
    } catch (e) { toast.error(apiError(e)); }
  };

  const items = tab === "pending" ? (pending?.items || []) : (rejected?.items || []);
  const isLoading = tab === "pending" ? loadingPending : loadingRejected;

  return (
    <div>
      <PageHeader
        title="طلبات تسجيل الطلاب"
        subtitle="راجع طلبات إنشاء حسابات الطلاب واعتمدها"
        breadcrumb={t("group_people")}
        actions={
          <Button variant="outline" onClick={() => refetchPending()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> تحديث
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList className="mb-4">
          <TabsTrigger value="pending" className="gap-2" data-testid="tab-pending">
            <Clock className="h-4 w-4" /> بانتظار الموافقة
            {pending?.total > 0 && <span className="ms-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{pending.total}</span>}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2" data-testid="tab-rejected">
            <UserX className="h-4 w-4" /> المرفوضة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {isLoading ? <LoadingState /> : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="لا توجد طلبات جديدة"
              hint="ستظهر هنا طلبات الطلاب الجدد عند إنشائها من صفحة التسجيل."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((it) => (
                <SignupCard key={it.user_id} item={it}
                  onApprove={setApproving} onReject={setRejecting} onDelete={onDelete}
                  showActions={canApprove} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected">
          {isLoading ? <LoadingState /> : items.length === 0 ? (
            <EmptyState icon={Inbox} title="لا يوجد طلبات مرفوضة" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((it) => (
                <SignupCard key={it.user_id} item={it}
                  onApprove={setApproving} onReject={setRejecting} onDelete={onDelete}
                  showActions={canApprove} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ApproveDialog
        open={!!approving} onOpenChange={(v) => !v && setApproving(null)}
        signup={approving} grades={grades} sections={sections} onDone={onDone}
      />
      <RejectDialog
        open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}
        signup={rejecting} onDone={onDone}
      />
    </div>
  );
}
