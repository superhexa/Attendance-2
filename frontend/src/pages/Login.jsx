import React, { useState } from "react";
import { useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import { School, Loader2, ShieldCheck, Mail, Lock, Sparkles, ArrowLeft, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { hasAjyalSession } from "@/lib/ajyalAuth";

export default function Login() {
  const { t, lang, toggle } = useLang();
  const { user, login, verify2fa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [twofa, setTwofa] = useState(null);
  const [otp, setOtp] = useState("");

  if (user && user.id) return <Navigate to={hasAjyalSession(user.id) ? "/dashboard" : "/ajyal-login"} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password, remember);
      if (result.requires_2fa) {
        setTwofa(result.user_id);
      } else {
        navigate("/ajyal-login", { replace: true, state: { from: location.state?.from } });
      }
    } catch (err) {
      if (err?.response?.data?.detail) {
        setError(apiError(err));
      } else if (err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
        setError(lang === "ar"
          ? "تعذّر الاتصال بالخادم. تأكد من الاتصال بالإنترنت ثم أعد المحاولة."
          : "Cannot reach the server. Check your connection and try again.");
      } else if (err?.response?.status >= 500) {
        setError(lang === "ar" ? "خطأ في الخادم. يرجى المحاولة بعد قليل." : "Server error. Please try again shortly.");
      } else {
        setError(lang === "ar" ? "تعذّر تسجيل الدخول. تأكد من البريد وكلمة المرور." : "Login failed. Check your email and password.");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verify2fa(twofa, otp);
      navigate("/ajyal-login", { replace: true, state: { from: location.state?.from } });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const isArabic = lang === "ar";
  const stageCopy = isArabic
    ? {
      brand: "مدرسة الملك حسين بن طلال",
      eyebrow: "مساحة المدرسة الرقمية",
      title: "يوم دراسي أكثر تنظيمًا يبدأ من هنا.",
      desc: "سجّل الدخول بحساب المدرسة، ثم أكمل التحقق من حساب أجيال.",
      schoolAccount: "حساب المدرسة",
      ajyalAccount: "حساب أجيال",
      switchLanguage: "English",
      newStudent: "طالب جديد؟",
      createAccount: "إنشاء حساب طالب",
    }
    : {
      brand: "King Hussein Bin Talal School",
      eyebrow: "Your school workspace",
      title: "A more organized school day starts here.",
      desc: "Sign in with your school account, then continue to Ajyal verification.",
      schoolAccount: "School account",
      ajyalAccount: "Ajyal account",
      switchLanguage: "العربية",
      newStudent: "New student?",
      createAccount: "Create a student account",
    };

  return (
    <main className="min-h-[100svh] bg-[#eeede4] px-0 py-0 sm:flex sm:items-center sm:justify-center sm:px-4 sm:py-5" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto grid min-h-[100svh] w-full max-w-5xl overflow-hidden bg-[#fffefa] shadow-[0_24px_80px_-38px_rgba(17,49,38,0.35)] sm:min-h-[calc(100svh-2.5rem)] sm:border sm:border-[#d9ddd2] lg:h-[min(720px,calc(100svh-2.5rem))] lg:min-h-0 lg:grid-cols-2 lg:rounded-lg">
        <section className="order-1 flex min-w-0 items-center px-5 py-7 sm:px-10 sm:py-10 lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:px-14">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-10 flex items-center justify-between gap-3">
              <Link to="/" className="flex min-w-0 items-center gap-3 text-[#173b31]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#174b3b] text-[#e5c875]"><School className="h-5 w-5" /></span>
                <span className="truncate text-sm font-extrabold sm:text-base">{t("app_name")}</span>
              </Link>
              <button onClick={toggle} type="button" className="shrink-0 rounded-md border border-[#d9ddd2] px-3 py-2 text-xs font-bold text-[#38564b] transition-colors hover:bg-[#f1f3ed] sm:text-sm" data-testid="login-lang-toggle">
                {stageCopy.switchLanguage}
              </button>
            </div>

            <div className="mb-8">
              <div className="mb-5 flex items-center gap-2 text-xs font-bold text-[#557166]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#174b3b] text-white">{twofa ? <Check className="h-4 w-4" /> : "1"}</span>
                <span>{stageCopy.schoolAccount}</span>
                <span className="h-px w-6 bg-[#d9ddd2]" />
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d9ddd2] text-[#77827a]">2</span>
                <span className="text-[#77827a]">{stageCopy.ajyalAccount}</span>
              </div>
              <span className="inline-flex items-center gap-2 text-xs font-extrabold text-[#a17c31]">
                <Sparkles className="h-4 w-4" />{stageCopy.eyebrow}
              </span>
              <h1 className="mt-3 text-3xl font-extrabold leading-tight text-[#173b31] sm:text-4xl">
                {twofa ? (isArabic ? "تحقق من هويتك" : "Verify your identity") : t("login")}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#69776f]">
                {twofa
                  ? (isArabic ? "أدخل رمز التحقق للمتابعة إلى حساب أجيال." : "Enter your verification code to continue to Ajyal.")
                  : t("login_subtitle")}
              </p>
            </div>

            {error && <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" data-testid="login-error">{error}</div>}

            {!twofa ? (
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2 text-sm font-bold text-[#314d41]"><Mail className="h-4 w-4 text-[#a17c31]" />{t("email")}</Label>
                  <Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@school.edu" data-testid="login-email" autoComplete="email" className="h-12 rounded-md border-[#d9ddd2] bg-white px-4 focus-visible:ring-[#31765d]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="flex items-center gap-2 text-sm font-bold text-[#314d41]"><Lock className="h-4 w-4 text-[#a17c31]" />{t("password")}</Label>
                  <Input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" data-testid="login-password" autoComplete="current-password" className="h-12 rounded-md border-[#d9ddd2] bg-white px-4 focus-visible:ring-[#31765d]" />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#63736a]">
                  <Checkbox checked={remember} onCheckedChange={(value) => setRemember(!!value)} data-testid="login-remember" />{t("remember_me")}
                </label>
                <Button type="submit" size="lg" className="h-12 w-full justify-between rounded-md bg-[#174b3b] px-5 font-bold text-white shadow-md shadow-[#174b3b]/15 hover:bg-[#103a2e]" disabled={loading} data-testid="login-submit">
                  <span className="inline-flex items-center gap-2">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />{t("signing_in")}</> : <><ShieldCheck className="h-4 w-4" />{t("login")}</>}</span>
                  <ArrowLeft className={`h-5 w-5 ${isArabic ? "" : "rotate-180"}`} />
                </Button>
              </form>
            ) : (
              <form onSubmit={submitOtp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="otp" className="flex items-center gap-2 text-sm font-bold text-[#314d41]"><ShieldCheck className="h-4 w-4 text-[#a17c31]" />{isArabic ? "رمز التحقق (2FA)" : "Two-factor code"}</Label>
                  <Input id="otp" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="123456" data-testid="login-otp" inputMode="numeric" autoComplete="one-time-code" className="h-12 rounded-md border-[#d9ddd2] bg-white px-4 text-center text-lg focus-visible:ring-[#31765d]" />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full rounded-md bg-[#174b3b] font-bold text-white hover:bg-[#103a2e]" disabled={loading} data-testid="login-otp-submit">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("confirm")}
                </Button>
              </form>
            )}

            <p className="mt-8 border-t border-[#e6e8e1] pt-5 text-center text-sm text-[#69776f]">
              {stageCopy.newStudent}{" "}
              <Link to="/signup" className="font-bold text-[#174b3b] underline-offset-4 hover:underline" data-testid="login-go-signup">{stageCopy.createAccount}</Link>
            </p>
            <p className="mt-7 text-center text-xs leading-5 text-[#89938c]">© 2026/2027 · {t("school_short")}</p>
          </div>
        </section>

        <aside className="order-2 relative hidden min-h-[230px] min-w-0 flex-col justify-between overflow-hidden bg-[#173b31] px-6 py-7 text-white sm:px-10 sm:py-9 lg:order-1 lg:flex lg:min-h-0 lg:overflow-y-auto lg:px-12 lg:py-11">
          <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
          <div className="pointer-events-none absolute inset-y-0 end-0 w-2 bg-[#d9bd73]" />
          <div className="relative z-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#d9bd73] text-[#173b31]"><School className="h-5 w-5" /></span>
            <div><p className="text-sm font-extrabold">{stageCopy.brand}</p><p className="text-xs text-white/60">{isArabic ? "بوابة الحضور المدرسي" : "School attendance portal"}</p></div>
          </div>
          <div className="relative z-10 my-7 max-w-md lg:my-0">
            <p className="mb-4 text-xs font-bold text-[#e5c875]">{stageCopy.eyebrow}</p>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{stageCopy.title}</h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/70">{stageCopy.desc}</p>
          </div>
          <div className="relative z-10 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 border-t border-white/20 pt-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9bd73] text-[#173b31]"><Check className="h-4 w-4" /></span>
              <span className="text-xs font-semibold leading-5">{stageCopy.schoolAccount}</span>
            </div>
            <div className="flex items-center gap-3 border-t border-white/20 pt-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9bd73] text-[#e5c875]">2</span>
              <span className="text-xs font-semibold leading-5 text-white/70">{stageCopy.ajyalAccount}</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
