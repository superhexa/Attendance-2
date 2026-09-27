import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import {
  Check, X, Clock, FileText, LogOut, CheckCheck, Lock, Search, ClipboardCheck,
  QrCode, Loader2, CalendarClock, ChevronLeft,
} from "lucide-react";

const STATUSES = [
  { key: "PRESENT", label: "حاضر", icon: Check, on: "bg-emerald-600 text-white border-emerald-600", off: "text-emerald-700 dark:text-emerald-400 border-border" },
  { key: "ABSENT", label: "غائب", icon: X, on: "bg-rose-600 text-white border-rose-600", off: "text-rose-700 dark:text-rose-400 border-border" },
  { key: "LATE", label: "متأخر", icon: Clock, on: "bg-amber-500 text-white border-amber-500", off: "text-amber-700 dark:text-amber-400 border-border" },
  { key: "EXCUSED", label: "بعذر", icon: FileText, on: "bg-indigo-600 text-white border-indigo-600", off: "text-indigo-700 dark:text-indigo-400 border-border" },
  { key: "LEFT_EARLY", label: "خروج مبكر", icon: LogOut, on: "bg-cyan-600 text-white border-cyan-600", off: "text-cyan-700 dark:text-cyan-400 border-border" },
];

function LessonPicker({ date, setDate, onPick }) {
  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["lessons-today", date],
    queryFn: async () => (await api.get("/lessons/today", { params: { date } })).data,
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Label className="font-semibold">التاريخ</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" data-testid="attendance-date" />
      </Card>
      {isLoading ? <LoadingState /> : lessons.length === 0 ? (
        <Card><EmptyState title="لا توجد حصص في هذا اليوم" icon={CalendarClock} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lessons.map((l) => (
            <Card key={l.id} className="card-hover flex cursor-pointer items-center justify-between p-4" onClick={() => onPick(l)} data-testid={`pick-lesson-${l.id}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="text-[10px]">حصة</span><span className="text-lg font-extrabold">{l.period}</span>
                </div>
                <div>
                  <p className="font-bold">{l.subject_name}</p>
                  <p className="text-sm text-muted-foreground">{l.grade_name} · {l.section_name} · {l.teacher_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {l.attendance_status === "locked" ? <Lock className="h-4 w-4 text-emerald-600" /> : <span className="text-xs font-semibold text-amber-600">لم يُسجّل</span>}
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AttendanceSheet({ timetableId, date, onBack }) {
  const { t } = useLang();
  const [roster, setRoster] = useState([]);
  const [lesson, setLesson] = useState(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [q, setQ] = useState("");
  const [correction, setCorrection] = useState(null);
  const [qrData, setQrData] = useState(null);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get("/settings")).data });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/attendance/roster", { params: { timetable_id: timetableId, date } });
      setRoster(data.roster.map((r) => ({ ...r })));
      setLesson(data.lesson); setLocked(data.locked);
    } catch (e) { toast.error(apiError(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [timetableId, date]);

  const setStatus = (id, status) => setRoster((r) => r.map((s) => (s.student_id === id ? { ...s, status } : s)));
  const markAll = () => setRoster((r) => r.map((s) => ({ ...s, status: "PRESENT" })));

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, LEFT_EARLY: 0 };
    roster.forEach((s) => { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }, [roster]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/attendance", { timetable_id: timetableId, date, records: roster.map((r) => ({ student_id: r.student_id, status: r.status, note: r.note || "" })) });
      toast.success("تم تسجيل الحضور وقفله"); setLocked(true);
    } catch (e) { toast.error(apiError(e)); } finally { setSubmitting(false); }
  };

  const genQR = async () => {
    try { const { data } = await api.post("/attendance/qr/generate", { timetable_id: timetableId, date }); setQrData(data); }
    catch (e) { toast.error(apiError(e)); }
  };

  const filtered = roster.filter((s) => !q || s.full_name.includes(q) || (s.student_number || "").includes(q));

  if (loading) return <LoadingState rows={8} />;

  return (
    <div className="pb-28">
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="back-to-lessons"><ChevronLeft className="h-5 w-5" /></Button>
          <div>
            <p className="text-lg font-extrabold">{lesson?.subject_name}</p>
            <p className="text-sm text-muted-foreground">{lesson?.grade_name} · {lesson?.section_name} · الحصة {lesson?.period} · {date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {settings?.qr_enabled && !locked && <Button variant="outline" onClick={genQR} className="gap-2" data-testid="gen-qr-btn"><QrCode className="h-4 w-4" /> رمز QR</Button>}
          {!locked && <Button variant="outline" onClick={markAll} className="gap-2" data-testid="mark-all-present"><CheckCheck className="h-4 w-4" /> تحديد الكل حاضر</Button>}
        </div>
      </Card>

      {locked && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Lock className="h-4 w-4" /> هذا الحضور مُسجّل ومقفل. لتعديله اطلب تصحيحًا من كل طالب.
        </div>
      )}

      <div className="relative mb-4 max-w-sm"><Search className="absolute top-2.5 h-4 w-4 text-muted-foreground start-3" />
        <Input placeholder="بحث عن طالب" value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" data-testid="roster-search" /></div>

      {filtered.length === 0 ? <Card><EmptyState title="لا يوجد طلاب في هذه الشعبة" /></Card> : (
        <div className="space-y-2">
          {filtered.map((s, idx) => (
            <Card key={s.student_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`roster-row-${s.student_id}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">{idx + 1}</span>
                <div>
                  <p className="font-semibold">{s.full_name}</p>
                  {s.student_number && <p className="text-xs text-muted-foreground">{s.student_number}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((st) => {
                  const active = s.status === st.key;
                  const Icon = st.icon;
                  return (
                    <button key={st.key} disabled={locked}
                      onClick={() => setStatus(s.student_id, st.key)}
                      data-testid={`status-${st.key}-${s.student_id}`}
                      className={cn("flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all disabled:opacity-60",
                        active ? st.on : `bg-transparent ${st.off} hover:bg-muted`)}>
                      <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{st.label}</span>
                    </button>
                  );
                })}
                {locked && <Button variant="ghost" size="sm" onClick={() => setCorrection({ student: s })} data-testid={`request-correction-${s.student_id}`}>طلب تصحيح</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Sticky bottom bar */}
      {!locked && (
        <div className="fixed bottom-0 z-20 border-t border-border glass p-4 start-0 end-0 lg:start-72">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <span className="text-emerald-600">حاضر {counts.PRESENT}</span>
              <span className="text-rose-600">غائب {counts.ABSENT}</span>
              <span className="text-amber-600">متأخر {counts.LATE}</span>
              <span className="hidden text-indigo-600 sm:inline">بعذر {counts.EXCUSED}</span>
            </div>
            <Button onClick={submit} disabled={submitting} size="lg" className="gap-2 font-bold" data-testid="submit-attendance">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} إرسال وقفل الحضور
            </Button>
          </div>
        </div>
      )}

      <CorrectionDialog correction={correction} onClose={() => setCorrection(null)} timetableId={timetableId} date={date} onDone={load} />
      <QRDialog data={qrData} onClose={() => setQrData(null)} />
    </div>
  );
}

function CorrectionDialog({ correction, onClose, timetableId, date, onDone }) {
  const [status, setStatus] = useState("PRESENT");
  const [reason, setReason] = useState("");
  const submit = async () => {
    try {
      // find session id from a record fetch
      const { data } = await api.get("/attendance/roster", { params: { timetable_id: timetableId, date } });
      const sessionId = data.session?.id;
      await api.post("/attendance/correction-request", { session_id: sessionId, student_id: correction.student.student_id, new_status: status, reason });
      toast.success("تم إرسال طلب التصحيح"); onClose(); onDone && onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={!!correction} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>طلب تصحيح حضور — {correction?.student?.full_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>الحالة الجديدة</Label>
            <Select value={status} onValueChange={setStatus}><SelectTrigger data-testid="correction-status"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>السبب</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="correction-reason" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={submit} data-testid="submit-correction">إرسال الطلب</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QRDialog({ data, onClose }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!data) return;
    const end = new Date(data.expires_at).getTime();
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [data]);
  return (
    <Dialog open={!!data} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>رمز حضور الحصة</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {data && (
            <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-slate-200">
              <QRCodeSVG value={data.code} size={220} level="M" data-testid="qr-svg" />
            </div>
          )}
          <p className="text-sm text-muted-foreground">اطلب من الطلاب مسح الرمز — ينتهي خلال</p>
          <p className={cn("text-3xl font-extrabold", left > 0 ? "text-emerald-600" : "text-rose-600")}>{left}s</p>
          <code className="rounded bg-muted px-3 py-1 text-xs">{data?.code}</code>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TakeAttendance() {
  const { t } = useLang();
  const [sp, setSp] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(sp.get("date") || today);
  const [lessonId, setLessonId] = useState(sp.get("lesson") || null);

  return (
    <div>
      <PageHeader title={t("nav.take_attendance")} subtitle="سجّل حضور طلاب حصتك بسرعة" breadcrumb={t("group_main")} />
      {lessonId ? (
        <AttendanceSheet timetableId={lessonId} date={date} onBack={() => { setLessonId(null); setSp({}); }} />
      ) : (
        <LessonPicker date={date} setDate={setDate} onPick={(l) => setLessonId(l.id)} />
      )}
    </div>
  );
}
