import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Inbox, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n";

export function LoadingState({ rows = 5 }) {
  return (
    <div className="space-y-3 p-2" data-testid="loading-state">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, icon: Icon = Inbox, action }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" data-testid="empty-state">
      <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
        <Icon className="h-8 w-8" />
      </div>
      <p className="text-base font-semibold text-foreground">{title || t("no_data")}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, message }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" data-testid="error-state">
      <div className="rounded-2xl bg-rose-100 p-4 text-rose-600 dark:bg-rose-500/15">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <p className="text-base font-semibold text-foreground">{message || t("error_generic")}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="retry-button">
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
