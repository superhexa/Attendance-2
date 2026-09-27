import React, { useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  valid: { c: "text-emerald-600", icon: CheckCircle2, l: "صالح" },
  duplicate: { c: "text-amber-600", icon: Copy, l: "مكرر" },
  error: { c: "text-rose-600", icon: AlertTriangle, l: "خطأ" },
};

export function ImportDialog({ type, open, onOpenChange, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = () => { setFile(null); setPreview(null); setLoading(false); };
  const close = (v) => { if (!v) reset(); onOpenChange(v); };

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/import/template", { params: { type }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `${type}_template.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); }
  };

  const doPreview = async () => {
    if (!file) { toast.error("اختر ملفًا أولًا"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/import/preview?type=${type}`, {
        method: "POST", credentials: "include", body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "فشل التحقق");
      setPreview(data);
    } catch (e) { toast.error(e.message || "تعذّر قراءة الملف"); } finally { setLoading(false); }
  };

  const commit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/import/commit", { type, rows: preview.rows });
      toast.success(`تم استيراد ${data.created} وتخطي ${data.skipped}`);
      onDone && onDone(); close(false);
    } catch (e) { toast.error(apiError(e)); } finally { setLoading(false); }
  };

  const isStudent = type === "students";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader><DialogTitle>استيراد {isStudent ? "الطلاب" : "المعلمين"} من ملف</DialogTitle></DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-2 text-sm text-muted-foreground">ارفع ملف CSV أو Excel بالأعمدة المطلوبة</p>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-4 block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-white" data-testid="import-file-input" />
              {file && <p className="mt-2 text-xs font-medium text-emerald-700">{file.name}</p>}
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="gap-2" data-testid="download-template">
              <Download className="h-4 w-4" /> تنزيل قالب فارغ
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">صالح: {preview.summary.valid}</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">مكرر: {preview.summary.duplicates}</span>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">خطأ: {preview.summary.errors}</span>
            </div>
            <ScrollArea className="h-72 rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted"><tr>
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">الاسم</th>
                  {isStudent ? <><th className="p-2 text-start">الصف</th><th className="p-2 text-start">الشعبة</th></> : <th className="p-2 text-start">البريد</th>}
                  <th className="p-2 text-start">الحالة</th>
                </tr></thead>
                <tbody>
                  {preview.rows.map((r, i) => {
                    const S = STATUS[r.status]; const Icon = S.icon;
                    return (
                      <tr key={i} className="border-t" data-testid={`import-row-${r.row}`}>
                        <td className="p-2 text-muted-foreground">{r.row}</td>
                        <td className="p-2 font-medium">{r.full_name}</td>
                        {isStudent ? <><td className="p-2">{r.grade}</td><td className="p-2">{r.section}</td></> : <td className="p-2">{r.email || "-"}</td>}
                        <td className={cn("p-2", S.c)}><span className="flex items-center gap-1"><Icon className="h-3.5 w-3.5" /> {S.l} {r.message && `· ${r.message}`}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {!preview ? (
            <Button onClick={doPreview} disabled={loading || !file} className="gap-2" data-testid="import-preview-btn">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} معاينة وتحقق
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPreview(null)}>رجوع</Button>
              <Button onClick={commit} disabled={loading || preview.summary.valid === 0} className="gap-2" data-testid="import-commit-btn">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} اعتماد استيراد {preview.summary.valid} سجل
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
