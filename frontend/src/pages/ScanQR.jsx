import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCode, CheckCircle2, Loader2, Camera, X } from "lucide-react";

export default function ScanQR() {
  const { t } = useLang();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const doSubmit = async (value) => {
    setLoading(true);
    try {
      await api.post("/attendance/qr/scan", { code: value });
      setDone(true); toast.success("تم تسجيل حضورك");
    } catch (err) { toast.error(apiError(err)); } finally { setLoading(false); }
  };

  const stopScan = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (e) {}
    setScanning(false);
  };

  const startScan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 120));
    try {
      const html5 = new Html5Qrcode("qr-reader");
      scannerRef.current = html5;
      await html5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 230 },
        async (decoded) => {
          await stopScan();
          setCode(decoded);
          await doSubmit(decoded);
        },
        () => {}
      );
    } catch (e) {
      toast.error("تعذّر الوصول إلى الكاميرا. يمكنك إدخال الرمز يدويًا");
      setScanning(false);
    }
  };

  useEffect(() => () => { stopScan(); }, []);

  const submitManual = (e) => { e.preventDefault(); if (code) doSubmit(code); };

  return (
    <div>
      <PageHeader title={t("nav.qr_scan")} subtitle="امسح رمز الحضور بالكاميرا أو أدخله يدويًا" breadcrumb={t("group_main")} />
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          {done ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <p className="text-lg font-bold text-emerald-600">تم تسجيل حضورك بنجاح</p>
            </>
          ) : (
            <>
              {scanning ? (
                <div className="w-full space-y-3">
                  <div id="qr-reader" className="mx-auto w-full overflow-hidden rounded-2xl border" />
                  <Button variant="outline" onClick={stopScan} className="gap-2" data-testid="stop-scan"><X className="h-4 w-4" /> إيقاف الكاميرا</Button>
                </div>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <QrCode className="h-10 w-10" />
                  </div>
                  <Button onClick={startScan} className="w-full gap-2 font-bold" size="lg" data-testid="start-scan">
                    <Camera className="h-5 w-5" /> بدء المسح بالكاميرا
                  </Button>
                  <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> أو <span className="h-px flex-1 bg-border" />
                  </div>
                  <form onSubmit={submitManual} className="w-full space-y-3">
                    <Input placeholder="أدخل رمز الحضور" value={code} onChange={(e) => setCode(e.target.value)}
                      className="text-center text-lg font-bold" data-testid="qr-code-input" />
                    <Button type="submit" variant="outline" className="w-full font-bold" disabled={loading || !code} data-testid="qr-submit">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الحضور"}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
