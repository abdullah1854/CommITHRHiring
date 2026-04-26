import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  headline: ReactNode;
  icon: ReactNode;
}

export function EmptyState({ action, className, description, headline, icon }: EmptyStateProps) {
  return (
    <Empty className={cn("border-0 py-12", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{headline}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
