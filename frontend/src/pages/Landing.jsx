import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  QrCode,
  School,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: ClipboardCheck, ar: ["تسجيل الحضور", "حدّث سجل الشعبة في مكان واحد."], en: ["Attendance", "Update the class register in one place."] },
  { icon: CalendarDays, ar: ["الجداول الدراسية", "اعرض الحصص والشعب بسرعة."], en: ["Timetables", "Find lessons and sections quickly."] },
  { icon: BarChart3, ar: ["تقارير واضحة", "تابع المؤشرات وصدّر النتائج."], en: ["Clear reports", "Follow indicators and export results."] },
  { icon: Bell, ar: ["تنبيهات المدرسة", "تابع الإعلانات والإشعارات المهمة."], en: ["School notices", "Keep up with announcements and important alerts."] },
  { icon: QrCode, ar: ["تسجيل QR", "تحقق من حضور الطلاب برمز مؤقت."], en: ["QR check-in", "Verify attendance with a temporary code."] },
  { icon: ShieldCheck, ar: ["صلاحيات وسجل", "حافظ على وضوح الوصول والتغييرات."], en: ["Access and audit", "Keep access and changes clear."] },
];

const ROLES = [
  { icon: LayoutDashboard, ar: ["الإدارة", "نظرة شاملة وإدارة واضحة للمدرسة."], en: ["Administration", "A clear, school-wide view and management."] },
  { icon: Users2, ar: ["المعلمون", "الحصص والطلاب وسجل الحضور اليومي."], en: ["Teachers", "Lessons, students, and the daily register."] },
  { icon: GraduationCap, ar: ["الطلاب", "الجدول والسجل والإعلانات في مكان واحد."], en: ["Students", "Schedule, attendance history, and notices in one place."] },
];

const STEPS = [
  { number: "01", ar: ["جهّز المدرسة", "أنشئ الأعوام والصفوف والشعب."], en: ["Set up the school", "Create years, grades, and sections."] },
  { number: "02", ar: ["أضف فريقك", "اربط المعلمين بالجداول والشعب."], en: ["Add your team", "Connect teachers with timetables and sections."] },
  { number: "03", ar: ["تابع كل يوم", "سجّل الحضور وراجع التقارير."], en: ["Run each day", "Record attendance and review reports."] },
];

function LandingNav({ isArabic, user, toggle }) {
  const copy = isArabic
    ? { features: "المعاينة", roles: "فريق المدرسة", how: "البدء", signup: "تسجيل طالب", login: user?.id ? "لوحة التحكم" : "تسجيل الدخول", language: "English" }
    : { features: "Preview", roles: "Your team", how: "Getting started", signup: "Student sign up", login: user?.id ? "Dashboard" : "Sign in", language: "العربية" };
  const destination = user?.id ? "/dashboard" : "/login";

  return (
    <header className="relative z-20 border-b border-[#dce2dc] bg-white">
      <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3 text-[#173b31]" aria-label={isArabic ? "الرئيسية" : "Home"}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#174b3b] text-[#e5c875]"><School className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold sm:text-base">{isArabic ? "نظام الحضور المدرسي" : "School Attendance"}</span>
            <span className="hidden truncate text-xs text-[#748078] sm:block">{isArabic ? "مدرسة الملك حسين بن طلال" : "King Hussein Bin Talal School"}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-[#50645a] lg:flex">
          <a href="#features" className="hover:text-[#174b3b]">{copy.features}</a>
          <a href="#roles" className="hover:text-[#174b3b]">{copy.roles}</a>
          <a href="#how" className="hover:text-[#174b3b]">{copy.how}</a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!user?.id && <Link to="/signup" className="hidden sm:block"><Button variant="ghost" className="h-10 rounded-md px-3 font-bold text-[#345347] hover:bg-[#eef2ec]" data-testid="landing-nav-signup">{copy.signup}</Button></Link>}
          <button onClick={toggle} type="button" className="h-10 rounded-md px-2.5 text-xs font-bold text-[#345347] hover:bg-[#eef2ec] sm:px-3 sm:text-sm" data-testid="landing-lang-toggle">{copy.language}</button>
          <Link to={destination}><Button className="h-10 rounded-md bg-[#174b3b] px-3 font-bold text-white hover:bg-[#103a2e] sm:px-4" data-testid="landing-nav-login">{copy.login}</Button></Link>
        </div>
      </div>
    </header>
  );
}

export default function Landing() {
  const { lang, toggle } = useLang();
  const { user } = useAuth();
  const isArabic = lang === "ar";
  const destination = user?.id ? "/dashboard" : "/login";
  const copy = isArabic
    ? {
      school: "مدرسة الملك حسين بن طلال الثانوية الشاملة للبنين",
      title: "نظام الحضور المدرسي",
      intro: "سجل يومك الدراسي بوضوح.",
      desc: "مساحة منظمة للحضور والجداول ومتابعة الطلاب، مصممة لفريق المدرسة.",
      start: "دخول مساحة المدرسة",
      sample: "معاينة توضيحية",
      register: "سجل الحضور اليومي",
      grade: "الصف العاشر · الشعبة أ",
      date: "الأحد، 27 أيلول 2026",
      student: "الطالب",
      state: "الحالة",
      present: "حاضر",
      absent: "غائب",
      late: "متأخر",
      attendance: "ملخص الشعبة",
      total: "إجمالي الطلاب",
      toolsLabel: "مساحة العمل",
      toolsTitle: "تفاصيل اليوم، دون ازدحام",
      toolsDesc: "الأدوات الأساسية لليوم الدراسي مرتبة في واجهة واحدة.",
      rolesLabel: "لكل فرد في المدرسة",
      rolesTitle: "كل دور يرى ما يحتاجه",
      howLabel: "إعداد بسيط",
      howTitle: "من التهيئة إلى المتابعة",
      finalTitle: "ابدأ من مساحة مدرستك",
      finalDesc: "سجّل الدخول بحساب المدرسة للمتابعة.",
      signIn: "تسجيل الدخول",
      footer: "إدارة الحضور المدرسي · 2026/2027",
    }
    : {
      school: "King Hussein Bin Talal Comprehensive Secondary School for Boys",
      title: "School Attendance",
      intro: "A clear register for every school day.",
      desc: "An organized space for attendance, timetables, and student follow-up, made for your school team.",
      start: "Enter the school workspace",
      sample: "Illustrative preview",
      register: "Daily attendance register",
      grade: "Grade 10 · Section A",
      date: "Sunday, September 27, 2026",
      student: "Student",
      state: "Status",
      present: "Present",
      absent: "Absent",
      late: "Late",
      attendance: "Class summary",
      total: "Students total",
      toolsLabel: "The workspace",
      toolsTitle: "The day, without the clutter",
      toolsDesc: "The essential tools for the school day, arranged in one clear interface.",
      rolesLabel: "For everyone at school",
      rolesTitle: "Each role sees what it needs",
      howLabel: "A simple setup",
      howTitle: "From setup to follow-up",
      finalTitle: "Start in your school workspace",
      finalDesc: "Sign in with your school account to continue.",
      signIn: "Sign in",
      footer: "School Attendance Management · 2026/2027",
    };

  const previewStudents = isArabic
    ? [["202601", "الطالب 01", copy.present], ["202602", "الطالب 02", copy.present], ["202603", "الطالب 03", copy.absent], ["202604", "الطالب 04", copy.late]]
    : [["202601", "Student 01", copy.present], ["202602", "Student 02", copy.present], ["202603", "Student 03", copy.absent], ["202604", "Student 04", copy.late]];

  return (
    <div className="min-h-screen bg-[#f5f7f3] text-[#193b31]" dir={isArabic ? "rtl" : "ltr"}>
      <LandingNav isArabic={isArabic} user={user} toggle={toggle} />

      <main>
        <section className="relative overflow-hidden border-b border-[#d7e0d8] bg-[#e8eee8]">
          <div className="mx-auto max-w-7xl px-4 pb-7 pt-8 sm:px-6 sm:pb-9 sm:pt-10 lg:px-8 lg:pt-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-bold text-[#496357] sm:text-sm"><span className="h-2 w-2 rounded-full bg-[#c38b2f]" />{copy.school}</p>
              <span className="font-mono text-xs font-semibold text-[#738078]">2026 / 2027</span>
            </div>
            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="max-w-3xl">
                <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">{copy.title}</h1>
                <p className="mt-3 text-xl font-bold leading-relaxed text-[#426456] sm:text-2xl">{copy.intro}</p>
                <p className="mt-2 max-w-2xl text-base leading-7 text-[#617268]">{copy.desc}</p>
              </div>
              <Link to={destination} className="shrink-0">
                <Button size="lg" className="h-12 w-full justify-between gap-6 rounded-md bg-[#174b3b] px-5 font-bold text-white hover:bg-[#103a2e] sm:w-auto" data-testid="landing-cta-login">{copy.start}<ArrowLeft className={`h-5 w-5 ${isArabic ? "" : "rotate-180"}`} /></Button>
              </Link>
            </div>

            <section id="features" className="mt-8 overflow-hidden border border-[#cbd8ce] bg-white shadow-[0_18px_48px_-36px_rgba(21,55,43,0.45)] sm:mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e0da] px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#e4eee7] text-[#174b3b]"><ClipboardCheck className="h-5 w-5" /></span>
                  <div className="min-w-0"><h2 className="truncate text-sm font-extrabold sm:text-base">{copy.register}</h2><p className="mt-0.5 truncate text-xs text-[#718077]">{copy.grade} · {copy.date}</p></div>
                </div>
                <span className="rounded-full border border-[#e8d9b9] bg-[#fbf6e9] px-2.5 py-1 text-[11px] font-bold text-[#8b6728]">{copy.sample}</span>
              </div>

              <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_250px]">
                <div className="min-w-0 p-3 sm:p-5">
                  <div className="mb-2 grid grid-cols-[76px_minmax(0,1fr)_72px] gap-2 border-b border-[#e4e9e3] px-2 py-2 text-[11px] font-bold text-[#7b887f] sm:grid-cols-[90px_minmax(0,1fr)_100px]">
                    <span>{isArabic ? "الرقم" : "ID"}</span><span>{copy.student}</span><span>{copy.state}</span>
                  </div>
                  {previewStudents.map(([studentId, studentName, status]) => (
                    <div key={studentId} className="grid grid-cols-[76px_minmax(0,1fr)_72px] gap-2 border-b border-[#edf0ec] px-2 py-3 text-xs sm:grid-cols-[90px_minmax(0,1fr)_100px] sm:text-sm">
                      <span className="font-mono text-[#7b887f]">{studentId}</span><span className="truncate font-semibold text-[#263d33]">{studentName}</span><span className={`font-bold ${status === copy.absent ? "text-[#a34c3b]" : status === copy.late ? "text-[#9a711e]" : "text-[#24785c]"}`}>{status}</span>
                    </div>
                  ))}
                </div>

                <aside className="border-t border-[#d9e0da] bg-[#f8faf7] p-4 sm:p-5 lg:border-s lg:border-t-0">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-extrabold">{copy.attendance}</p><BarChart3 className="h-4 w-4 text-[#a17c31]" /></div>
                  <div className="mt-5 flex items-end justify-between"><span className="text-xs font-medium text-[#748078]">{copy.total}</span><span className="text-2xl font-extrabold text-[#174b3b]">28 <span className="text-xs font-semibold text-[#77827a]">/ 30</span></span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e3e9e3]"><div className="h-full w-[93%] rounded-full bg-[#278766]" /></div>
                  <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-[#69776f]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#278766]" />{copy.present} 24</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#b95f4d]" />{copy.absent} 02</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#c38b2f]" />{copy.late} 01</span></div>
                </aside>
              </div>
            </section>
          </div>
        </section>

        <section className="bg-white py-14 sm:py-18 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 border-b border-[#d9e0da] pb-7 md:grid-cols-[0.7fr_1.3fr] md:items-end">
              <p className="text-sm font-bold text-[#a17c31]">{copy.toolsLabel}</p>
              <div><h2 className="text-3xl font-extrabold leading-snug sm:text-4xl">{copy.toolsTitle}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65746a] sm:text-base">{copy.toolsDesc}</p></div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, ar, en }, index) => {
                const [featureTitle, description] = isArabic ? ar : en;
                return <article key={featureTitle} className={`grid grid-cols-[2.25rem_2.5rem_1fr] items-start gap-3 border-b border-[#e3e8e2] py-5 ${index % 2 === 0 ? "sm:border-e" : ""} lg:border-e ${index >= 3 ? "lg:border-b-0" : ""}`}><span className="pt-1 font-mono text-xs font-bold text-[#a17c31]">0{index + 1}</span><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#e4eee7] text-[#174b3b]"><Icon className="h-[18px] w-[18px]" /></span><div><h3 className="text-base font-extrabold">{featureTitle}</h3><p className="mt-1 text-sm leading-6 text-[#68776d]">{description}</p></div></article>;
              })}
            </div>
          </div>
        </section>

        <section id="roles" className="bg-[#e8eee8] py-14 sm:py-18 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 grid gap-3 border-b border-[#cfd9d1] pb-7 sm:mb-10 md:grid-cols-[0.7fr_1.3fr] md:items-end"><p className="text-sm font-bold text-[#a17c31]">{isArabic ? "فريق المدرسة" : "The school team"}</p><h2 className="text-3xl font-extrabold sm:text-4xl">{copy.rolesTitle}</h2></div>
            <div className="grid border-y border-[#cfd9d1] md:grid-cols-3">
              {ROLES.map(({ icon: Icon, ar, en }, index) => {
                const [roleTitle, description] = isArabic ? ar : en;
                return <article key={roleTitle} className={`flex items-start gap-4 border-b border-[#cfd9d1] py-5 md:border-b-0 md:px-5 ${index > 0 ? "md:border-s" : "md:ps-0"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-[#174b3b]"><Icon className="h-5 w-5" /></span><div><h3 className="font-extrabold">{roleTitle}</h3><p className="mt-1 text-sm leading-6 text-[#65746a]">{description}</p></div></article>;
              })}
            </div>
          </div>
        </section>

        <section id="how" className="bg-[#173b31] py-14 text-white sm:py-18 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 border-b border-white/20 pb-7 sm:mb-10"><p className="text-sm font-bold text-[#e5c875]">{isArabic ? "البدء" : "Getting started"}</p><h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">{copy.howTitle}</h2></div>
            <div className="grid md:grid-cols-3">
              {STEPS.map(({ number, ar, en }, index) => {
                const [stepTitle, description] = isArabic ? ar : en;
                return <article key={number} className={`border-b border-white/20 py-5 md:border-b-0 md:px-6 ${index > 0 ? "md:border-s" : "md:ps-0"}`}><p className="font-mono text-sm font-bold text-[#e5c875]">{number}</p><h3 className="mt-3 text-lg font-extrabold">{stepTitle}</h3><p className="mt-1 text-sm leading-6 text-white/65">{description}</p></article>;
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#d9bd73] py-9 sm:py-11">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-2xl font-extrabold sm:text-3xl">{copy.finalTitle}</h2><p className="mt-1 text-sm leading-6 text-[#3f4d40] sm:text-base">{copy.finalDesc}</p></div><Link to={destination} className="shrink-0"><Button size="lg" className="h-12 w-full justify-between gap-7 rounded-md bg-[#173b31] px-5 font-bold text-white hover:bg-[#10291f] sm:w-auto">{copy.signIn}<ArrowLeft className={`h-5 w-5 ${isArabic ? "" : "rotate-180"}`} /></Button></Link></div>
        </section>
      </main>

      <footer className="bg-white py-6"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-center sm:flex-row sm:px-6 sm:text-start lg:px-8"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#174b3b] text-[#e5c875]"><School className="h-5 w-5" /></span><div><p className="text-sm font-bold">{copy.school}</p><p className="text-xs text-[#758078]">{copy.footer}</p></div></div><p className="text-xs text-[#758078]">© 2026</p></div></footer>
    </div>
  );
}
