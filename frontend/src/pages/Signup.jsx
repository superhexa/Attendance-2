import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import {
  School, Loader2, KeyRound, User, Mail, Lock, IdCard, Sparkles, ArrowLeft, ArrowRight,
  Users, Building2, Phone, CalendarDays, Check, Clock, ShieldCheck,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const STEPS = ["key", "personal", "class", "done"];

export default function Signup() {
  const { t, lang, toggle } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [step, setStep] = useState(0); // 0-key, 1-personal, 2-class, 3-done
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [structure, setStructure] = useState(null);
  const [form, setForm] = useState({
    school_key: "",
    full_name: "",
    email: "",
    password: "",
    student_number: "",
    dob: "",
    gender: "male",
    guardian_name: "",
    guardian_phone: "",
    contact_phone: "",
    grade_id: "",
    section_id: "",
  });

  useEffect(() => {
    api.get("/auth/school-info").then(({ data }) => setInfo(data)).catch(() => setInfo({}));
  }, []);

  const sectionsForGrade = useMemo(() => {
    if (!structure || !form.grade_id) return [];
    return structure.sections.filter((s) => s.grade_id === form.grade_id);
  }, [structure, form.grade_id]);

  if (user && user.id) return <Navigate to="/dashboard" replace />;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const disabled = info && info.signup_enabled === false;
  const stepLabels = lang === "ar" ? ["مفتاح المدرسة", "بيانات الطالب", "الصف والشعبة"] : ["School key", "Your details", "Class placement"];

  const validateKey = async () => {
    setError("");
    if (!form.school_key.trim()) {
      setError(lang === "ar" ? "أدخل مفتاح المدرسة" : "Enter the school key");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/auth/public-structure", { params: { school_key: form.school_key.trim().toUpperCase() } });
      setStructure(data);
      setStep(1);
    } catch (err) {
      setError(apiError(err, lang === "ar" ? "مفتاح غير صحيح" : "Invalid key"));
    } finally {
      setLoading(false);
    }
  };

  const validatePersonal = () => {
    setError("");
    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      setError(lang === "ar" ? "الاسم مطلوب" : "Name is required"); return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setError(lang === "ar" ? "بريد إلكتروني غير صالح" : "Invalid email"); return false;
    }
    if (form.password.length < 6) {
      setError(lang === "ar" ? "كلمة المرور ٦ أحرف على الأقل" : "Password min 6 chars"); return false;
    }
    return true;
  };

  const submit = async () => {
    setError("");
    if (!form.grade_id || !form.section_id) {
      setError(lang === "ar" ? "اختر الصف والشعبة" : "Choose grade & section"); return;
    }
    setLoading(true);
    try {
      const payload = { ...form, school_key: form.school_key.trim().toUpperCase() };
      if (!payload.student_number) delete payload.student_number;
      await api.post("/auth/signup/student", payload);
      setStep(3);
    } catch (err) {
      setError(apiError(err, lang === "ar" ? "تعذّر إرسال الطلب" : "Signup failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100svh] bg-[#eeede4] sm:flex sm:items-center sm:justify-center" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto grid min-h-[100svh] w-full max-w-5xl overflow-hidden bg-[#fffefa] shadow-[0_24px_80px_-38px_rgba(17,49,38,0.35)] sm:my-4 sm:min-h-[calc(100svh-2rem)] sm:border sm:border-[#d9ddd2] lg:h-[min(720px,calc(100svh-2rem))] lg:min-h-0 lg:grid-cols-2 lg:rounded-lg">
        <section className="order-1 min-w-0 px-4 py-6 sm:px-7 sm:py-8 md:px-10 lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:px-12">
          <div className="mx-auto w-full max-w-xl">
          {/* Top nav */}
          <div className="mb-6 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-emerald-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
                <School className="h-5 w-5" />
              </div>
              <span className="hidden sm:inline">{t("app_name")}</span>
            </Link>
            <button onClick={toggle} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100" data-testid="signup-lang-toggle">
              {lang === "ar" ? "English" : "العربية"}
            </button>
          </div>

          {/* Progress */}
          {step < 3 && (
            <ol aria-label={lang === "ar" ? "خطوات التسجيل" : "Registration steps"} className="mb-6 grid grid-cols-3 gap-2">
              {STEPS.slice(0, 3).map((name, i) => (
                <li key={name} aria-current={i === step ? "step" : undefined} className="min-w-0">
                  <div className={`flex min-h-9 items-center gap-2 text-xs font-bold ${i <= step ? "text-[#174b3b]" : "text-[#929b94]"}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${i < step ? "bg-[#174b3b] text-white" : i === step ? "bg-[#174b3b] text-white ring-4 ring-[#e5c875]/40" : "bg-[#e6e7df] text-[#7d887e]"}`}>
                      {i < step ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={`${i === step ? "" : "hidden sm:inline"} truncate`}>{stepLabels[i]}</span>
                  </div>
                  <div className={`mt-2 h-1 rounded-full ${i <= step ? "bg-[#d9bd73]" : "bg-[#e6e7df]"}`} />
                </li>
              ))}
            </ol>
          )}

          <div className="border-t border-[#e0e1d8] pt-6 sm:pt-8">
            {step < 3 && (
              <>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <Sparkles className="h-3.5 w-3.5" /> {lang === "ar" ? "تسجيل حساب طالب" : "Student signup"}
                </span>
                <h1 className="mt-4 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                  {step === 0 && (lang === "ar" ? "أدخل مفتاح المدرسة" : "Enter the school key")}
                  {step === 1 && (lang === "ar" ? "بياناتك الشخصية" : "Your details")}
                  {step === 2 && (lang === "ar" ? "الصف والشعبة" : "Grade & section")}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {step === 0 && (lang === "ar" ? "المفتاح يمنحه لك مدير المدرسة" : "Ask your director for the key")}
                  {step === 1 && (info?.school_name_ar || t("school_short"))}
                  {step === 2 && (lang === "ar" ? "اختر صفك الحالي وشعبتك" : "Pick your current grade & section")}
                </p>
              </>
            )}

            {disabled && step < 3 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {lang === "ar" ? "تسجيل الطلاب معطّل حاليًا. تواصل مع إدارة المدرسة." : "Signup is disabled. Contact your school."}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" data-testid="signup-error">
                {error}
              </div>
            )}

            {/* Step 0: key */}
            {step === 0 && (
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="school_key" className="flex items-center gap-2 text-slate-700">
                    <KeyRound className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "مفتاح المدرسة" : "School key"}
                  </Label>
                  <Input id="school_key" required value={form.school_key}
                    onChange={(e) => set("school_key", e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="text-center font-mono text-lg tracking-widest"
                    data-testid="signup-school-key" autoComplete="off" />
                </div>
                <Button onClick={validateKey} size="lg" disabled={loading || disabled}
                  className="w-full gap-2 rounded-xl bg-emerald-600 font-bold shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
                  data-testid="signup-step-next">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>{lang === "ar" ? "متابعة" : "Continue"}
                      {lang === "ar" ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step 1: personal */}
            {step === 1 && (
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-slate-700"><User className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "الاسم الكامل" : "Full name"}</Label>
                  <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
                    placeholder={lang === "ar" ? "اسمك الرباعي" : "Your full name"} data-testid="signup-full-name" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-slate-700"><Mail className="h-4 w-4 text-emerald-600" /> {t("email")}</Label>
                    <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                      placeholder="name@school.edu" data-testid="signup-email" autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-slate-700"><Lock className="h-4 w-4 text-emerald-600" /> {t("password")}</Label>
                    <Input type="password" minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)}
                      placeholder="••••••••" data-testid="signup-password" autoComplete="new-password" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-slate-700"><IdCard className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "رقم الطالب (اختياري)" : "Student # (optional)"}</Label>
                    <Input value={form.student_number} onChange={(e) => set("student_number", e.target.value)}
                      placeholder="2026001" data-testid="signup-student-number" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-slate-700"><CalendarDays className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "تاريخ الميلاد" : "Date of birth"}</Label>
                    <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} data-testid="signup-dob" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">{lang === "ar" ? "الجنس" : "Gender"}</Label>
                  <RadioGroup value={form.gender} onValueChange={(v) => set("gender", v)} className="flex gap-4">
                    <label className={"flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-all " + (form.gender === "male" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                      <RadioGroupItem value="male" data-testid="signup-gender-male" /> {lang === "ar" ? "ذكر" : "Male"}
                    </label>
                    <label className={"flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-all " + (form.gender === "female" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                      <RadioGroupItem value="female" data-testid="signup-gender-female" /> {lang === "ar" ? "أنثى" : "Female"}
                    </label>
                  </RadioGroup>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Users className="h-3.5 w-3.5" /> {lang === "ar" ? "معلومات ولي الأمر (اختياري)" : "Guardian info (optional)"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-slate-700">{lang === "ar" ? "اسم ولي الأمر" : "Guardian name"}</Label>
                      <Input value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} data-testid="signup-guardian-name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-2 text-slate-700"><Phone className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "رقم ولي الأمر" : "Guardian phone"}</Label>
                      <Input value={form.guardian_phone} onChange={(e) => set("guardian_phone", e.target.value)} data-testid="signup-guardian-phone" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="lg" onClick={() => setStep(0)} className="gap-2 rounded-xl">
                    {lang === "ar" ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                    {lang === "ar" ? "السابق" : "Back"}
                  </Button>
                  <Button size="lg" onClick={() => { if (validatePersonal()) setStep(2); }}
                    className="flex-1 gap-2 rounded-xl bg-emerald-600 font-bold shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
                    data-testid="signup-step-personal-next">
                    {lang === "ar" ? "متابعة" : "Continue"}
                    {lang === "ar" ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: class */}
            {step === 2 && (
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-slate-700"><Building2 className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "الصف" : "Grade"}</Label>
                  <Select value={form.grade_id} onValueChange={(v) => { set("grade_id", v); set("section_id", ""); }}>
                    <SelectTrigger data-testid="signup-grade"><SelectValue placeholder={lang === "ar" ? "اختر صفك" : "Select your grade"} /></SelectTrigger>
                    <SelectContent>
                      {structure?.grades?.length ? structure.grades.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      )) : <SelectItem value="none" disabled>{lang === "ar" ? "لا توجد صفوف" : "No grades"}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-slate-700"><Users className="h-4 w-4 text-emerald-600" /> {lang === "ar" ? "الشعبة" : "Section"}</Label>
                  <Select value={form.section_id} onValueChange={(v) => set("section_id", v)} disabled={!form.grade_id}>
                    <SelectTrigger data-testid="signup-section"><SelectValue placeholder={lang === "ar" ? (form.grade_id ? "اختر شعبتك" : "اختر الصف أولًا") : "Select section"} /></SelectTrigger>
                    <SelectContent>
                      {sectionsForGrade.length ? sectionsForGrade.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      )) : <SelectItem value="none" disabled>{lang === "ar" ? "لا توجد شعب" : "No sections"}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-900">
                  <p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> {lang === "ar" ? "قبل الإرسال" : "Before you submit"}</p>
                  <p className="mt-1 text-xs text-emerald-800/90">
                    {lang === "ar"
                      ? "بعد الإرسال، سيقوم مدير المدرسة بمراجعة طلبك واعتماده. لن تتمكن من تسجيل الدخول قبل الموافقة."
                      : "After submission, the school director will review and approve your request. You cannot sign in until approved."}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="lg" onClick={() => setStep(1)} className="gap-2 rounded-xl">
                    {lang === "ar" ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                    {lang === "ar" ? "السابق" : "Back"}
                  </Button>
                  <Button size="lg" onClick={submit} disabled={loading}
                    className="flex-1 gap-2 rounded-xl bg-emerald-600 font-bold shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
                    data-testid="signup-submit">
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> {lang === "ar" ? "جارٍ الإرسال..." : "Submitting..."}</>
                      : <>{lang === "ar" ? "إرسال الطلب" : "Submit request"} <Check className="h-5 w-5" /></>}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: success/pending */}
            {step === 3 && (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Clock className="h-10 w-10" />
                </div>
                <h1 className="mt-6 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                  {lang === "ar" ? "تم إرسال طلبك بنجاح" : "Your request was sent"}
                </h1>
                <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
                  {lang === "ar"
                    ? "بانتظار موافقة مدير المدرسة. سنعلمك عبر البريد الإلكتروني بمجرد تفعيل حسابك. يمكنك محاولة تسجيل الدخول لاحقًا."
                    : "Your request is pending director approval. We'll let you know once your account is active. You can try signing in later."}
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                  <Link to="/login">
                    <Button size="lg" className="gap-2 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700" data-testid="signup-done-login">
                      {t("login")} {lang === "ar" ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                    </Button>
                  </Link>
                  <Link to="/">
                    <Button size="lg" variant="outline" className="rounded-xl">
                      {lang === "ar" ? "العودة للرئيسية" : "Back to home"}
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {step < 3 && (
              <p className="mt-6 text-center text-sm text-slate-600">
                {lang === "ar" ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
                <Link to="/login" className="font-bold text-emerald-700 hover:underline" data-testid="signup-go-login">
                  {t("login")}
                </Link>
              </p>
            )}
          </div>

          <p className="mt-7 text-center text-xs text-[#89938c]">
            © 2026 · {info?.school_name_ar || t("school_short")}
          </p>
          </div>
        </section>

        <aside className="order-2 relative hidden min-w-0 flex-col justify-between overflow-hidden bg-[#173b31] px-10 py-11 text-white lg:order-1 lg:flex lg:min-h-0 lg:overflow-y-auto xl:px-12">
          <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 0)", backgroundSize: "34px 34px" }} />
          <div className="pointer-events-none absolute inset-y-0 end-0 w-2 bg-[#d9bd73]" />
          <div className="relative z-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#d9bd73] text-[#173b31]"><School className="h-5 w-5" /></span>
            <div><p className="text-sm font-extrabold">{info?.school_name_ar || t("school_short")}</p><p className="mt-1 text-xs text-white/60">{lang === "ar" ? "بوابة التسجيل المدرسي" : "School registration portal"}</p></div>
          </div>
          <div className="relative z-10 my-10">
            <p className="text-xs font-bold text-[#e5c875]">{lang === "ar" ? "بداية جديدة في مدرستك" : "A new chapter at your school"}</p>
            <h2 className="mt-4 max-w-sm text-3xl font-extrabold leading-tight xl:text-4xl">{lang === "ar" ? "خطوات بسيطة، وملف مدرسي متكامل." : "A few clear steps to your school profile."}</h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/70">{lang === "ar" ? "أكمل بياناتك واختر شعبتك لإرسال طلب التسجيل إلى إدارة المدرسة." : "Add your details and choose your class to send your request to the school."}</p>
          </div>
          <div className="relative z-10 space-y-4 border-t border-white/20 pt-5">
            {stepLabels.map((label, i) => <div key={label} className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-[#d9bd73] text-[#173b31]" : "border border-white/30 text-white/60"}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span><span className={`text-sm ${i === step ? "font-bold text-white" : "text-white/60"}`}>{label}</span></div>)}
          </div>
        </aside>
      </div>
    </main>
  );
}
