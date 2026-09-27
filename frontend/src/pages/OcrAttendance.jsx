import React, { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, Upload, ScanLine, Loader2, Check, X, RotateCcw, Sparkles, AlertTriangle,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUSES = [
  { v: "PRESENT", l: "حاضر", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { v: "ABSENT", l: "غائب", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { v: "LATE", l: "متأخر", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { v: "EXCUSED", l: "بعذر", color: "bg-sky-100 text-sky-700 border-sky-200" },
  { v: "LEFT_EARLY", l: "خروج مبكر", color: "bg-violet-100 text-violet-700 border-violet-200" },
];

async function resizeImage(file, maxDim = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          URL.revokeObjectURL(url);
          resolve({ b64: String(reader.result).split(",")[1], dataUrl: reader.result });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function StatusPill({ value, onChange }) {
  const cur = STATUSES.find((s) => s.v === value) || STATUSES[0];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-8 min-w-[100px] border-2 font-bold ${cur.color}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function OcrAttendance() {
  const { t } = useLang();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [draft, setDraft] = useState(null); // { draft_id, rows, confidence, section, date, subject }
  const [rows, setRows] = useState([]);
  const [context, setContext] = useState({ date: new Date().toISOString().slice(0, 10), section_id: "", subject_id: "" });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections"], queryFn: async () => (await api.get("/sections")).data,
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"], queryFn: async () => (await api.get("/subjects")).data,
  });
  const { data: studentsData } = useQuery({
    queryKey: ["students", context.section_id],
    queryFn: async () => (await api.get("/students", { params: { section_id: context.section_id, limit: 200 } })).data,
    enabled: !!context.section_id,
  });
  const sectionStudents = useMemo(() => (studentsData?.items || []), [studentsData]);

  const pickFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("الرجاء اختيار صورة"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("الصورة أكبر من 15 ميغابايت"); return; }
    try {
      const { b64, dataUrl } = await resizeImage(file);
      setPreview(dataUrl);
      await runOcr(b64);
    } catch (e) {
      toast.error("تعذّر معالجة الصورة");
    }
  };

  const runOcr = async (b64) => {
    setScanning(true);
    setDraft(null); setRows([]);
    try {
      const { data } = await api.post("/ocr/attendance", { image_base64: b64 });
      setDraft(data);
      // Try to auto-match rows to students in the picked section
      const initialRows = (data.rows || []).map((r, i) => ({
        idx: i,
        student_id: r._matched_student_id || "",
        student_number: r.student_number || "",
        name: r.name || "",
        status: r.status || "PRESENT",
        note: r.note || "",
      }));
      setRows(initialRows);
      toast.success(`تم استخراج ${initialRows.length} صف (ثقة ${Math.round((data.confidence || 0) * 100)}%)`);
    } catch (e) {
      toast.error(apiError(e, "فشل استخراج البيانات"));
    } finally { setScanning(false); }
  };

  const updateRow = (idx, patch) => {
    setRows((rs) => rs.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx) => setRows((rs) => rs.filter((r) => r.idx !== idx));

  const reset = () => {
    setPreview(null); setDraft(null); setRows([]);
  };

  const commit = async () => {
    if (!context.section_id) { toast.error("اختر الشعبة"); return; }
    const invalid = rows.filter((r) => !r.student_id).length;
    if (invalid > 0) { toast.error(`يرجى مطابقة ${invalid} صف مع طالب من الشعبة`); return; }
    if (!window.confirm(`سيتم اعتماد ${rows.length} سجل حضور. هل أنت متأكد؟`)) return;
    setCommitting(true);
    try {
      const payload = {
        draft_id: draft.draft_id,
        date: context.date,
        section_id: context.section_id,
        subject_id: context.subject_id || null,
        rows: rows.map((r) => ({ student_id: r.student_id, status: r.status, note: r.note })),
      };
      const { data } = await api.post("/ocr/confirm", payload);
      toast.success(`تم الاعتماد: ${data.inserted} جديد، ${data.updated} محدَّث`);
      reset();
    } catch (e) {
      toast.error(apiError(e));
    } finally { setCommitting(false); }
  };

  const confidence = Math.round(((draft?.confidence) || 0) * 100);
  const confidenceColor = confidence >= 80 ? "text-emerald-600" : confidence >= 60 ? "text-amber-600" : "text-rose-600";

  return (
    <div>
      <PageHeader
        title="قراءة دفتر الحضور بالذكاء الاصطناعي"
        subtitle="التقط صورة لصفحة السجل — سيقوم النظام باستخراج البيانات وعليك التدقيق قبل الاعتماد"
        breadcrumb={t("group_main")}
      />

      {!draft && (
        <Card className="mb-4 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900">
              <Sparkles className="h-5 w-5 text-emerald-600" /> ابدأ المسح
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                   onChange={(e) => pickFile(e.target.files?.[0])} data-testid="ocr-camera-input" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
                   onChange={(e) => pickFile(e.target.files?.[0])} data-testid="ocr-file-input" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Button size="lg" onClick={() => cameraRef.current?.click()} disabled={scanning}
                      className="h-24 flex-col gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="ocr-camera">
                <Camera className="h-8 w-8" />
                <span className="font-bold">التقاط بالكاميرا</span>
              </Button>
              <Button size="lg" variant="outline" onClick={() => fileRef.current?.click()} disabled={scanning}
                      className="h-24 flex-col gap-2 border-emerald-300" data-testid="ocr-upload">
                <Upload className="h-8 w-8" />
                <span className="font-bold">رفع صورة</span>
              </Button>
            </div>
            {preview && (
              <div className="mt-4 flex flex-col items-center gap-3">
                <img src={preview} alt="preview" className="max-h-64 rounded-lg border shadow" />
                {scanning && (
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                    <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحليل بالذكاء الاصطناعي...
                  </div>
                )}
              </div>
            )}
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="me-1 inline h-4 w-4" />
              التقط صورة واضحة للجدول من الأعلى، وتأكد من وضوح الأسماء والعلامات قبل المتابعة.
            </p>
          </CardContent>
        </Card>
      )}

      {draft && (
        <>
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Badge className="bg-emerald-600"><ScanLine className="me-1 h-3.5 w-3.5" /> مسودة OCR</Badge>
                <span className={`text-sm font-bold ${confidenceColor}`}>ثقة الاستخراج: {confidence}%</span>
                {confidence < 70 && <span className="text-xs text-amber-700">⚠️ تأكد جيدًا من كل صف</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>التاريخ</Label>
                  <Input type="date" value={context.date} onChange={(e) => setContext({ ...context, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>الشعبة</Label>
                  <Select value={context.section_id} onValueChange={(v) => setContext({ ...context, section_id: v })}>
                    <SelectTrigger data-testid="ocr-section"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.grade_name} - {s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>المادة (اختياري)</Label>
                  <Select value={context.subject_id} onValueChange={(v) => setContext({ ...context, subject_id: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between border-b py-3">
              <CardTitle className="text-base">راجع السجلات ({rows.length})</CardTitle>
              <Button variant="outline" onClick={reset} size="sm" className="gap-2">
                <RotateCcw className="h-4 w-4" /> بدء جديد
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {rows.map((r) => (
                  <div key={r.idx} className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
                    <div>
                      <Label className="text-xs text-slate-500">الطالب من السجل</Label>
                      <p className="font-bold text-slate-800">{r.name}</p>
                      {r.student_number && <p className="text-xs text-slate-500">#{r.student_number}</p>}
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">مطابقة مع طالب في الشعبة</Label>
                      <Select value={r.student_id} onValueChange={(v) => updateRow(r.idx, { student_id: v })} disabled={!context.section_id}>
                        <SelectTrigger className={r.student_id ? "" : "border-amber-400 bg-amber-50"} data-testid={`ocr-match-${r.idx}`}>
                          <SelectValue placeholder={context.section_id ? "اختر الطالب" : "اختر الشعبة أولًا"} />
                        </SelectTrigger>
                        <SelectContent>
                          {sectionStudents.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name} {s.student_number ? `· ${s.student_number}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <StatusPill value={r.status} onChange={(v) => updateRow(r.idx, { status: v })} />
                    <Button variant="ghost" size="icon" onClick={() => removeRow(r.idx)} className="text-rose-600 hover:bg-rose-50">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">لا توجد سجلات</p>}
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-24 mt-4 flex gap-2 sm:bottom-4">
            <Button variant="outline" onClick={reset} className="flex-1 sm:flex-none">إلغاء</Button>
            <Button onClick={commit} disabled={committing || rows.length === 0} size="lg"
                    className="flex-1 gap-2 bg-emerald-600 shadow-lg shadow-emerald-500/30 hover:bg-emerald-700" data-testid="ocr-commit">
              {committing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              اعتماد {rows.length} سجل
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
