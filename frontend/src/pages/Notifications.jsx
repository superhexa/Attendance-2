import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const { t } = useLang();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
  });

  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const markAll = async () => { await api.post("/notifications/read-all"); qc.invalidateQueries({ queryKey: ["notifications"] }); };

  return (
    <div>
      <PageHeader title={t("nav.notifications")} subtitle="مركز الإشعارات"
        actions={<Button variant="outline" onClick={markAll} className="gap-2" data-testid="mark-all-read-btn"><CheckCheck className="h-4 w-4" /> تعليم الكل كمقروء</Button>} />
      {isLoading ? <LoadingState /> : (data?.items || []).length === 0 ? (
        <Card><EmptyState title="لا توجد إشعارات" icon={Bell} /></Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((n) => (
            <Card key={n.id} className={cn("flex items-start justify-between gap-3 p-4", !n.read && "border-primary/40 bg-primary/5")} data-testid={`notif-${n.id}`}>
              <div className="flex gap-3">
                <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", n.read ? "bg-muted-foreground/30" : "bg-primary")} />
                <div>
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("ar")}</p>
                </div>
              </div>
              {!n.read && <Button variant="ghost" size="sm" onClick={() => markRead(n.id)} data-testid={`read-${n.id}`}>تعليم كمقروء</Button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
