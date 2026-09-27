import React from "react";

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="space-y-1">
        {breadcrumb && <div className="text-xs font-medium text-muted-foreground">{breadcrumb}</div>}
        <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl" data-testid="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
