import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { ClipboardList, Check, X } from "lucide-react";

export default function Corrections() {
  const { t } = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [review, setReview] = useState(null);
  const [reason, setReason] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["corrections", status],
    queryFn: async () => (await api.get("/attendance/corrections", { params: { status } })).data,
  });
  const canApprove = can("attendance.approve");

  const doReview = async (action) => {
    try {
      await api.post(`/attendance/corrections/${review.id}/review`, { action, reason });
      toast.success(action === "approve" ? "تمت الموافقة" : "تم الرفض");
      setReview(null); setReason(""); qc.invalidateQueries({ queryKey: ["corrections"] });
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title={t("nav.corrections")} subtitle="طلبات تصحيح الحضور" breadcrumb={t("group_main")} />
      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="corr-tab-pending">قيد الانتظار</TabsTrigger>
          <TabsTrigger value="approved" data-testid="corr-tab-approved">مقبولة</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="corr-tab-rejected">مرفوضة</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? <LoadingState /> : data.length === 0 ? <Card><EmptyState title="لا توجد طلبات" icon={ClipboardList} /></Card> : (
        <div className="space-y-3">
          {data.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`corr-${r.id}`}>
              <div className="space-y-1">
                <p className="font-bold">{r.student_name}</p>
                <div className="flex items-center gap-2 text-sm">
                  <StatusBadge status={r.old_status} /> <span className="text-muted-foreground">←</span> <StatusBadge status={r.new_status} />
                </div>
                <p className="text-sm text-muted-foreground">السبب: {r.reason}</p>
                <p className="text-xs text-muted-foreground">بواسطة {r.requested_by_name} · {r.date}</p>
              </div>
              {r.status === "pending" && canApprove && (
                <Button onClick={() => setReview(r)} data-testid={`review-${r.id}`}>مراجعة</Button>
              )}
              {r.status !== "pending" && <StatusBadge status={r.status} />}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!review} onOpenChange={() => setReview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>مراجعة طلب التصحيح</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">الطالب: <b>{review?.student_name}</b></p>
            <div className="flex items-center gap-2"><StatusBadge status={review?.old_status} /> ← <StatusBadge status={review?.new_status} /></div>
            <p className="text-sm text-muted-foreground">السبب: {review?.reason}</p>
            <div className="space-y-1.5"><Label>ملاحظة المراجعة (اختياري)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="review-reason" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="gap-2 text-rose-600" onClick={() => doReview("reject")} data-testid="reject-correction"><X className="h-4 w-4" /> رفض</Button>
            <Button className="gap-2" onClick={() => doReview("approve")} data-testid="approve-correction"><Check className="h-4 w-4" /> موافقة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
