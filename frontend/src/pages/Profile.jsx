import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Monitor, KeyRound, ShieldCheck, LogOut, Loader2 } from "lucide-react";

function ChangePassword() {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("تم تغيير كلمة المرور");
      setCur(""); setNw("");
    } catch (err) { toast.error(apiError(err)); } finally { setLoading(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> تغيير كلمة المرور</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-md gap-4">
          <div className="space-y-1.5"><Label>كلمة المرور الحالية</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required data-testid="current-password" /></div>
          <div className="space-y-1.5"><Label>كلمة المرور الجديدة</Label><Input type="password" value={nw} onChange={(e) => setNw(e.target.value)} required data-testid="new-password" /></div>
          <Button type="submit" disabled={loading} data-testid="change-password-btn">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TwoFA() {
  const { user, loadMe } = useAuth();
  const [setup, setSetup] = useState(null);
  const [otp, setOtp] = useState("");
  const [codes, setCodes] = useState(null);
  const begin = async () => {
    try { const { data } = await api.post("/auth/2fa/setup"); setSetup(data); } catch (e) { toast.error(apiError(e)); }
  };
  const enable = async () => {
    try {
      const { data } = await api.post("/auth/2fa/enable", { otp });
      setCodes(data.recovery_codes); setSetup(null); await loadMe(); toast.success("تم تفعيل المصادقة الثنائية");
    } catch (e) { toast.error(apiError(e)); }
  };
  const disable = async () => {
    try { await api.post("/auth/2fa/disable"); await loadMe(); toast.success("تم التعطيل"); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> المصادقة الثنائية (2FA)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {user?.twofa_enabled ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">المصادقة الثنائية مفعّلة</span>
            <Button variant="destructive" size="sm" onClick={disable} data-testid="disable-2fa">تعطيل</Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">امسح الرمز في تطبيق المصادقة أو أدخل المفتاح يدويًا:</p>
            <code className="block rounded-lg bg-muted p-3 text-center text-sm font-bold tracking-widest">{setup.secret}</code>
            <div className="flex gap-2">
              <Input placeholder="رمز التحقق" value={otp} onChange={(e) => setOtp(e.target.value)} data-testid="2fa-otp" />
              <Button onClick={enable} data-testid="enable-2fa">تفعيل</Button>
            </div>
          </div>
        ) : codes ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-600">احفظ رموز الاسترداد هذه في مكان آمن:</p>
            <div className="grid grid-cols-2 gap-2">{codes.map((c) => <code key={c} className="rounded bg-muted p-2 text-center text-sm">{c}</code>)}</div>
          </div>
        ) : (
          <Button onClick={begin} data-testid="setup-2fa">إعداد المصادقة الثنائية</Button>
        )}
      </CardContent>
    </Card>
  );
}

function Sessions() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sessions"], queryFn: async () => (await api.get("/auth/sessions")).data });
  const revoke = async (id) => { await api.delete(`/auth/sessions/${id}`); qc.invalidateQueries({ queryKey: ["sessions"] }); toast.success("تم إنهاء الجلسة"); };
  const revokeAll = async () => { await api.post("/auth/sessions/revoke-all"); qc.invalidateQueries({ queryKey: ["sessions"] }); toast.success("تم إنهاء بقية الجلسات"); };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" /> الجلسات النشطة</CardTitle>
        <Button variant="outline" size="sm" onClick={revokeAll} data-testid="revoke-all-sessions">إنهاء بقية الأجهزة</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(data || []).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`session-${s.id}`}>
            <div>
              <p className="font-semibold">{s.device} {s.current && <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">الحالية</span>}</p>
              <p className="text-xs text-muted-foreground">{s.ip} · آخر نشاط {new Date(s.last_active).toLocaleString("ar")}</p>
            </div>
            {!s.current && <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => revoke(s.id)} data-testid={`revoke-${s.id}`}><LogOut className="h-4 w-4" /></Button>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  return (
    <div>
      <PageHeader title={t("nav.profile")} subtitle={user?.email} breadcrumb={t("group_system")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6"><ChangePassword /><TwoFA /></div>
        <Sessions />
      </div>
    </div>
  );
}
