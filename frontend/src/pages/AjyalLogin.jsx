import React, { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  School,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { hasAjyalSession, saveAjyalSession } from "@/lib/ajyalAuth";

const backendBase = process.env.REACT_APP_BACKEND_URL || window.location.origin;
const ajyalApi = axios.create({
  baseURL: `${backendBase}/api/ajyal`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export default function AjyalLogin() {
  const { user } = useAuth();
  const { lang, toggle } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = useMemo(() => username.trim() && password.trim() && !loading, [username, password, loading]);
  const isArabic = lang === "ar";
  const t = (english, arabic) => isArabic ? arabic : english;
  const returnTo = location.state?.from?.pathname;
  const destination = returnTo && returnTo !== "/ajyal-login" ? returnTo : "/dashboard";

  if (user === null) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f4ed]"><Loader2 className="h-7 w-7 animate-spin text-emerald-800" /></div>;
  }
  if (user === false) return <Navigate to="/login" state={{ from: location }} replace />;
  if (hasAjyalSession(user.id)) return <Navigate to={destination} replace />;

  const finishLogin = (id) => {
    saveAjyalSession(id, user.id);
    navigate(destination, { replace: true });
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const { data } = await ajyalApi.post("/auth/login", {
        username: username.trim(),
        password,
      });

      if (data.requires_otp) {
        setSessionId(data.session_id);
        setRequiresOtp(true);
        setSuccess(t(
          "Ajyal requires a six-digit code. Ajyal sends it to the contact on your Ajyal account; this app cannot send or resend it. Check that contact or ask your school Ajyal administrator to verify it.",
          "يتطلب أجيال رمزًا من ستة أرقام. يرسله أجيال إلى وسيلة التواصل المسجلة في حسابك؛ لا يستطيع هذا التطبيق إرسال الرمز أو إعادة إرساله. تحقق من وسيلة التواصل أو اطلب من مسؤول أجيال في مدرستك مراجعتها."
        ));
        return;
      }

      if (data.authenticated && data.session_id) {
        finishLogin(data.session_id);
      } else {
        setError(t("Ajyal could not confirm this login. Please try again.", "تعذر تأكيد الدخول إلى أجيال. يرجى المحاولة مرة أخرى."));
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || t("Login failed.", "تعذر تسجيل الدخول.");
      setError(typeof detail === "string" ? detail : t("Login failed.", "تعذر تسجيل الدخول."));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const { data } = await ajyalApi.post(`/auth/${sessionId}/otp`, {
        code: otp.trim(),
      });
      if (data.authenticated && data.session_id) {
        finishLogin(data.session_id);
      } else {
        setError(t("That code could not complete Ajyal sign-in. Try again.", "تعذر إكمال تسجيل الدخول إلى أجيال بهذا الرمز. حاول مرة أخرى."));
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || t("Code verification failed.", "فشل التحقق من الرمز.");
      setError(typeof detail === "string" ? detail : t("Code verification failed.", "فشل التحقق من الرمز."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100svh] bg-[#eeede4] px-0 py-0 sm:flex sm:items-center sm:justify-center sm:px-4 sm:py-5" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto grid min-h-[100svh] w-full max-w-5xl overflow-hidden bg-white shadow-[0_24px_80px_-38px_rgba(17,49,38,0.35)] sm:min-h-[calc(100svh-2.5rem)] sm:border sm:border-[#d9ddd2] lg:h-[min(720px,calc(100svh-2.5rem))] lg:min-h-0 lg:grid-cols-2 lg:rounded-lg">
          <section className="order-2 relative hidden min-h-[250px] flex-col justify-between overflow-hidden bg-[#123b31] px-6 py-7 text-white sm:px-10 sm:py-9 lg:order-1 lg:flex lg:min-h-0 lg:overflow-y-auto lg:px-12 lg:py-11">
            <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
            <div className="pointer-events-none absolute -bottom-40 -end-20 h-[28rem] w-[28rem] rounded-t-full border border-[#d5b86a]/30" />
            <div className="pointer-events-none absolute -bottom-32 -end-12 h-[24rem] w-[24rem] rounded-t-full border border-[#d5b86a]/25" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#d9bd73] text-[#123b31]"><School className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-extrabold tracking-[0.12em]">AJYAL</p>
                <p className="text-xs text-white/65">{t("Education portal", "بوابة التعليم")}</p>
              </div>
            </div>

            <div className="relative z-10 my-8 max-w-md lg:my-0">
              <p className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#e2c979]">
                <span className="h-px w-7 bg-[#e2c979]" />{t("A secure school day starts here", "يوم دراسي آمن يبدأ من هنا")}
              </p>
              <h2 className="max-w-sm text-3xl font-extrabold leading-tight sm:text-4xl">
                {t("One more step to your learning world.", "خطوة أخرى نحو عالمك التعليمي.")}
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-7 text-white/70">
                {t("Sign in to your Ajyal account to continue to the school attendance workspace.", "سجّل الدخول إلى حساب أجيال للمتابعة إلى مساحة الحضور المدرسي.")}
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 rounded-md border border-white/15 bg-white/[0.06] p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9bd73] text-[#123b31]"><Check className="h-4 w-4" /></span>
                <span className="text-xs font-semibold leading-5">{t("School account verified", "تم التحقق من حساب المدرسة")}</span>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-[#d9bd73]/50 bg-[#d9bd73]/10 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9bd73] text-[#e2c979]">02</span>
                <span className="text-xs font-semibold leading-5">{t("Ajyal verification", "التحقق من أجيال")}</span>
              </div>
            </div>
          </section>

          <section className="order-1 flex min-w-0 items-center bg-[#fffefa] px-5 py-6 sm:px-10 sm:py-10 lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:px-14">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-10 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#557166]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e5eee7] text-[#1c604b]"><Check className="h-4 w-4" /></span>
                  <span>{t("School account", "حساب المدرسة")}</span>
                  <span className="h-px w-6 bg-[#d9ddd2]" />
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#123b31] text-xs text-white">2</span>
                  <span className="text-[#123b31]">{t("Ajyal", "أجيال")}</span>
                </div>
                <button onClick={toggle} type="button" className="rounded-md border border-[#d9ddd2] px-3 py-1.5 text-xs font-bold text-[#38564b] transition-colors hover:bg-[#f1f3ed]" aria-label={t("Switch language", "تغيير اللغة")}>
                  {isArabic ? "English" : "العربية"}
                </button>
              </div>

              <div className="mb-7">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-[#eaf0e9] text-[#19523f]">
                  {requiresOtp ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                </div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#a17c31]">{t("SECOND SIGN-IN", "تسجيل الدخول الثاني")}</p>
                <h1 className="mt-2 text-3xl font-extrabold text-[#173b31]">
                  {requiresOtp ? t("Verify your identity", "تحقق من هويتك") : t("Sign in to Ajyal", "تسجيل الدخول إلى أجيال")}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#69776f]">
                  {requiresOtp ? t("Enter the six-digit code sent to your registered contact.", "أدخل الرمز المكوّن من ستة أرقام والمرسل إلى وسيلة التواصل المسجلة.") : t("Use your Ajyal credentials to finish signing in.", "استخدم بيانات أجيال لإكمال تسجيل الدخول.")}
                </p>
              </div>

              {error && <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}
              {success && <div role="status" className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-950">{success}</div>}

              {!requiresOtp ? (
                <form onSubmit={submitLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="ajyal-username" className="flex items-center gap-2 text-sm font-bold text-[#314d41]">
                      <UserRound className="h-4 w-4 text-[#a17c31]" />{t("Ajyal username", "اسم مستخدم أجيال")}
                    </Label>
                    <Input id="ajyal-username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("Enter your username", "أدخل اسم المستخدم")} autoComplete="username" className="h-12 rounded-md border-[#d9ddd2] bg-white px-4 placeholder:text-[#a0aaa3] focus-visible:ring-[#31765d]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ajyal-password" className="flex items-center gap-2 text-sm font-bold text-[#314d41]">
                      <LockKeyhole className="h-4 w-4 text-[#a17c31]" />{t("Password", "كلمة المرور")}
                    </Label>
                    <div className="relative">
                      <Input id="ajyal-password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete="current-password" className="h-12 rounded-md border-[#d9ddd2] bg-white px-4 pe-12 placeholder:text-[#a0aaa3] focus-visible:ring-[#31765d]" />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-[#738078] hover:text-[#173b31]" aria-label={showPassword ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="mt-2 h-12 w-full justify-between rounded-md bg-[#174b3b] px-5 text-sm font-bold text-white shadow-md shadow-[#174b3b]/15 hover:bg-[#103a2e]" disabled={!canSubmit}>
                    <span className="inline-flex items-center gap-2">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />{t("Signing in...", "جارٍ تسجيل الدخول...")}</> : <><ShieldCheck className="h-4 w-4" />{t("Continue to Ajyal", "المتابعة إلى أجيال")}</>}</span>
                    {isArabic ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              ) : (
                <form onSubmit={submitOtp} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="ajyal-otp" className="flex items-center gap-2 text-sm font-bold text-[#314d41]">
                      <KeyRound className="h-4 w-4 text-[#a17c31]" />{t("Six-digit verification code", "رمز التحقق المكوّن من ستة أرقام")}
                    </Label>
                    <Input id="ajyal-otp" type="text" required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-14 rounded-md border-[#d9ddd2] bg-white px-4 text-center text-xl font-bold tracking-[0.35em] placeholder:text-[#b3b9b1] focus-visible:ring-[#31765d]" />
                  </div>
                  <Button type="submit" className="h-12 w-full justify-between rounded-md bg-[#174b3b] px-5 text-sm font-bold text-white shadow-md shadow-[#174b3b]/15 hover:bg-[#103a2e]" disabled={loading || otp.trim().length !== 6}>
                    <span className="inline-flex items-center gap-2">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />{t("Verifying...", "جارٍ التحقق...")}</> : <><ShieldCheck className="h-4 w-4" />{t("Verify and continue", "تحقق وتابع")}</>}</span>
                    {isArabic ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </Button>
                  <button type="button" onClick={() => { setRequiresOtp(false); setOtp(""); setError(""); setSuccess(""); }} className="w-full text-sm font-semibold text-[#567064] hover:text-[#173b31]">
                    {t("Use different Ajyal credentials", "استخدم بيانات أجيال مختلفة")}
                  </button>
                </form>
              )}

              <div className="mt-8 flex items-center gap-3 border-t border-[#e6e8e1] pt-5 text-xs leading-5 text-[#77827a]">
                <LockKeyhole className="h-4 w-4 shrink-0 text-[#a17c31]" />
                <p>{t("Your Ajyal credentials are used only to establish your secure session.", "تُستخدم بيانات أجيال لإنشاء جلستك الآمنة فقط.")}</p>
              </div>
            </div>
          </section>
      </div>
    </main>
  );
}
