import React from "react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STYLES = {
  PRESENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  ABSENT: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200 dark:border-rose-500/20",
  LATE: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  EXCUSED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20",
  LEFT_EARLY: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/20",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300 border-slate-200 dark:border-slate-600/40",
  submitted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  locked: "bg-emerald-600 text-white border-emerald-700",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

export function StatusBadge({ status, className, testid }) {
  const { t } = useLang();
  return (
    <span
      data-testid={testid}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        STYLES[status] || STYLES.pending,
        className
      )}
    >
      {t(status) || status}
    </span>
  );
}
