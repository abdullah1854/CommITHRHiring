import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function CandidateStatusBadge({ status, className }: StatusBadgeProps) {
  // Each variant uses an alpha-tinted accent so the badge keeps the same
  // colour identity in both light and dark themes without going invisible.
  const variants: Record<string, string> = {
    new: "bg-muted text-foreground border-border",
    reviewing: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
    shortlisted: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
    interview_scheduled: "bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300",
    rejected: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300",
    hired: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-300",
  };

  const labels: Record<string, string> = {
    new: "New",
    reviewing: "Reviewing",
    shortlisted: "Shortlisted",
    interview_scheduled: "Interview",
    rejected: "Rejected",
    hired: "Hired",
  };

  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-semibold border",
        variants[status] || variants.new,
        className
      )}
    >
      {labels[status] || status}
    </span>
  );
}

export function JobStatusBadge({ status, className }: StatusBadgeProps) {
  const variants: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-300",
    open: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
    closed: "bg-muted text-foreground border-border",
    archived: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300",
  };

  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider",
        variants[status] || variants.draft,
        className
      )}
    >
      {status}
    </span>
  );
}

export function FitLabelBadge({ fitLabel, className }: { fitLabel: string; className?: string }) {
  const variants: Record<string, string> = {
    strong_fit: "bg-emerald-500/15 text-emerald-800 border-emerald-500/25 dark:text-emerald-300",
    moderate_fit: "bg-blue-500/15 text-blue-800 border-blue-500/25 dark:text-blue-300",
    weak_fit: "bg-red-500/15 text-red-800 border-red-500/25 dark:text-red-300",
  };

  const labels: Record<string, string> = {
    strong_fit: "Strong Fit",
    moderate_fit: "Moderate Fit",
    weak_fit: "Weak Fit",
  };

  return (
    <span
      className={cn(
        "px-3 py-1 rounded-full text-xs font-bold border",
        variants[fitLabel] || variants.weak_fit,
        className
      )}
    >
      {labels[fitLabel] || fitLabel}
    </span>
  );
}
