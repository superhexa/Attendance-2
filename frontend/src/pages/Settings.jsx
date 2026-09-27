import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/DataStates";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Database, Save, HardDriveDownload, School, Clock, QrCode, ShieldAlert, KeyRound, RefreshCw, Copy, Check } from "lucide-react";

export default function Settings() {
  const { t } = useLang();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get("/settings")).data });
  const { data: backups = [] } = useQuery({ queryKey: ["backups"], queryFn: async () => (await api.get("/settings/backups")).data });
  const [form, setForm] = useState(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);

  if (isLoading || !form) return <div><PageHeader title={t("nav.settings")} breadcrumb={t("group_system")} /><LoadingState /></div>;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setThreshold = (k, v) => setForm((f) => ({ ...f, absence_thresholds: { ...f.absence_thresholds, [k]: +v } }));

  const save = async () => {
    try {
      await api.patch("/settings", {
        school_name_ar: form.school_name_ar, school_name_en: form.school_name_en,
        late_threshold_minutes: +form.late_threshold_minutes, attendance_window_minutes: +form.attendance_window_minutes,
        grace_period_minutes: +form.grace_period_minutes, absence_thresholds: form.absence_thresholds,
        qr_enabled: form.qr_enabled, periods_count: +form.periods_count, lesson_duration: +form.lesson_duration,
        timezone: form.timezone, maintenance_mode: form.maintenance_mode, require_2fa_admins: form.require_2fa_admins,
        student_signup_enabled: form.student_signup_enabled,
      });
      toast.success("تم حفظ الإعدادات"); qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) { toast.error(apiError(e)); }
  };
  const backup = async () => { try { await api.post("/settings/backup"); toast.success("تم إنشاء نسخة احتياطية"); qc.invalidateQueries({ queryKey: ["backups"] }); } catch (e) { toast.error(apiError(e)); } };

  const rotateKey = async () => {
    if (!window.confirm("سيؤدي هذا إلى إبطال المفتاح الحالي. هل تريد المتابعة؟")) return;
    try {
      setRotating(true);
      const { data: res } = await api.post("/settings/rotate-signup-key");
      setForm((f) => ({ ...f, student_signup_key: res.student_signup_key }));
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("تم إنشاء مفتاح جديد");
    } catch (e) { toast.error(apiError(e)); }
    finally { setRotating(false); }
  };

  const copyKey = async () => {
    if (!form.student_signup_key) return;
    try {
      await navigator.clipboard.writeText(form.student_signup_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { toast.error("تعذر النسخ"); }
  };

  return (
    <div>
      <PageHeader title={t("nav.settings")} subtitle="إعدادات المدرسة والنظام" breadcrumb={t("group_system")}
        actions={<Button onClick={save} className="gap-2" data-testid="save-settings"><Save className="h-4 w-4" /> حفظ</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><School className="h-5 w-5" /> بيانات المدرسة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label>اسم المدرسة (عربي)</Label><Input value={form.school_name_ar} onChange={(e) => set("school_name_ar", e.target.value)} data-testid="school-name-ar" /></div>
            <div className="space-y-1.5"><Label>اسم المدرسة (إنجليزي)</Label><Input value={form.school_name_en} onChange={(e) => set("school_name_en", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>المنطقة الزمنية</Label><Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-emerald-900">
              <KeyRound className="h-5 w-5 text-emerald-600" /> مفتاح تسجيل الطلاب
            </CardTitle>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Switch checked={form.student_signup_enabled ?? true} onCheckedChange={(v) => set("student_signup_enabled", v)} data-testid="signup-enabled-toggle" />
                <span>مفعّل</span>
              </label>
              <Button variant="outline" onClick={rotateKey} disabled={rotating} className="gap-2" data-testid="rotate-signup-key">
                <RefreshCw className={"h-4 w-4 " + (rotating ? "animate-spin" : "")} /> {form.student_signup_key ? "إنشاء مفتاح جديد" : "إنشاء المفتاح"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-600">
              شارك هذا المفتاح مع طلاب المدرسة فقط. سيحتاجونه لإنشاء حساباتهم عبر صفحة التسجيل. يمكنك إبطاله وإنشاء مفتاح جديد في أي وقت.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 rounded-xl border-2 border-dashed border-emerald-300 bg-white px-4 py-4 text-center">
                {form.student_signup_key ? (
                  <p className="select-all font-mono text-lg font-extrabold tracking-widest text-emerald-800 sm:text-2xl" data-testid="signup-key-display">
                    {form.student_signup_key}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-400">لم يتم إنشاء مفتاح بعد</p>
                )}
              </div>
              <Button variant="outline" onClick={copyKey} disabled={!form.student_signup_key} className="gap-2 h-12" data-testid="copy-signup-key">
                {copied ? <><Check className="h-4 w-4 text-emerald-600" /> نُسِخ</> : <><Copy className="h-4 w-4" /> نسخ</>}
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              رابط صفحة التسجيل: <code className="rounded bg-white px-1.5 py-0.5 text-emerald-700 border border-emerald-100">/signup</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> قواعد الحضور</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>حد التأخر (دقيقة)</Label><Input type="number" value={form.late_threshold_minutes} onChange={(e) => set("late_threshold_minutes", e.target.value)} data-testid="late-threshold" /></div>
            <div className="space-y-1.5"><Label>نافذة التسجيل (دقيقة)</Label><Input type="number" value={form.attendance_window_minutes} onChange={(e) => set("attendance_window_minutes", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>عدد الحصص</Label><Input type="number" value={form.periods_count} onChange={(e) => set("periods_count", e.target.value)} data-testid="periods-count" /></div>
            <div className="space-y-1.5"><Label>مدة الحصة (دقيقة)</Label><Input type="number" value={form.lesson_duration} onChange={(e) => set("lesson_duration", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> عتبات تنبيه الغياب</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>تحذير</Label><Input type="number" value={form.absence_thresholds.warning} onChange={(e) => setThreshold("warning", e.target.value)} data-testid="threshold-warning" /></div>
            <div className="space-y-1.5"><Label>تنبيه</Label><Input type="number" value={form.absence_thresholds.alert} onChange={(e) => setThreshold("alert", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>حرج</Label><Input type="number" value={form.absence_thresholds.critical} onChange={(e) => setThreshold("critical", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> ميزات ووضع النظام</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between"><span className="font-medium">الحضور عبر رمز QR</span><Switch checked={form.qr_enabled} onCheckedChange={(v) => set("qr_enabled", v)} data-testid="qr-toggle" /></label>
            <label className="flex items-center justify-between"><span className="font-medium">إلزام المشرفين بالمصادقة الثنائية</span><Switch checked={form.require_2fa_admins} onCheckedChange={(v) => set("require_2fa_admins", v)} data-testid="2fa-admins-toggle" /></label>
            <label className="flex items-center justify-between"><span className="font-medium">وضع الصيانة</span><Switch checked={form.maintenance_mode} onCheckedChange={(v) => set("maintenance_mode", v)} data-testid="maintenance-toggle" /></label>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> النسخ الاحتياطي</CardTitle>
            <Button variant="outline" onClick={backup} className="gap-2" data-testid="trigger-backup"><HardDriveDownload className="h-4 w-4" /> إنشاء نسخة الآن</Button>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">آخر نسخة: {form.last_backup_at ? new Date(form.last_backup_at).toLocaleString("ar") : "لا يوجد"}</p>
            <div className="space-y-2">
              {backups.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد نسخ سابقة</p> : backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{new Date(b.created_at).toLocaleString("ar")}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">مكتملة</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
