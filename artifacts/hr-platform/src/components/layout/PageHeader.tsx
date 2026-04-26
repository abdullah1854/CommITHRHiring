import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  actions?: ReactNode;
  className?: string;
  subtitle?: ReactNode;
  title: ReactNode;
}

export function PageHeader({ actions, className, subtitle, title }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-display font-bold tracking-tight text-foreground md:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
