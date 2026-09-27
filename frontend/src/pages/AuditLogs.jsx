import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, Search } from "lucide-react";

const ACTION_AR = {
  login: "تسجيل دخول", "login.failed": "دخول فاشل", logout: "تسجيل خروج", create: "إنشاء", update: "تعديل",
  delete: "حذف", move: "نقل", activate: "تفعيل", "attendance.create": "تسجيل حضور", "attendance.modify": "تعديل حضور",
  "attendance.correction_request": "طلب تصحيح", "attendance.correction_approve": "موافقة تصحيح",
  "attendance.correction_reject": "رفض تصحيح", "password.change": "تغيير كلمة مرif", "password.reset": "إعادة تعيين كلمة المرور",
  "settings.change": "تغيير إعدادات", "report.export": "تصدير تقرير", "session.revoke": "إنهاء جلسة",
  "2fa.enable": "تفعيل 2FA", "2fa.disable": "تعطيل 2FA", "backup.create": "نسخ احتياطي",
};

export default function AuditLogs() {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const id = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(id); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", debounced, page],
    queryFn: async () => (await api.get("/audit-logs", { params: { search: debounced || undefined, page, limit: 25 } })).data,
  });
  const totalPages = Math.ceil((data?.total || 0) / 25);

  return (
    <div>
      <PageHeader title={t("nav.audit")} subtitle="سجل تدقيق غير قابل للتعديل لجميع العمليات الحساسة" breadcrumb={t("group_system")} />
      <Card className="mb-4 p-4">
        <div className="relative max-w-sm"><Search className="absolute top-2.5 h-4 w-4 text-muted-foreground start-3" />
          <Input placeholder="بحث بالمستخدم أو العملية" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="ps-9" data-testid="audit-search" /></div>
      </Card>
      <Card className="overflow-hidden">
        {isLoading ? <LoadingState /> : (data?.items || []).length === 0 ? <EmptyState title="لا توجد سجلات" icon={ScrollText} /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-start">الوقت</TableHead><TableHead className="text-start">المستخدم</TableHead>
              <TableHead className="text-start">العملية</TableHead><TableHead className="text-start">المورد</TableHead>
              <TableHead className="text-start">IP</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.items.map((l) => (
                <TableRow key={l.id} data-testid={`audit-${l.id}`}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(l.timestamp).toLocaleString("ar")}</TableCell>
                  <TableCell className="font-medium">{l.user_name || "-"}</TableCell>
                  <TableCell><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{ACTION_AR[l.action] || l.action}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.resource}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.ip || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
          <span className="text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
        </div>
      )}
    </div>
  );
}
