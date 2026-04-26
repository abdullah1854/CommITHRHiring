import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function CandidateStatusBadge({ status, className }: StatusBadgeProps) {
  const variants: Record<string, string> = {
    new: "bg-slate-100 text-slate-700 border-slate-200",
    reviewing: "bg-blue-50 text-blue-700 border-blue-200",
    shortlisted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    interview_scheduled: "bg-purple-50 text-purple-700 border-purple-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    hired: "bg-indigo-50 text-indigo-700 border-indigo-200",
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
    draft: "bg-yellow-50 text-yellow-700 border-yellow-200",
    open: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-slate-100 text-slate-700 border-slate-200",
    archived: "bg-red-50 text-red-700 border-red-200",
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
    strong_fit: "bg-emerald-100 text-emerald-800 border-emerald-200",
    moderate_fit: "bg-yellow-100 text-yellow-800 border-yellow-200",
    weak_fit: "bg-red-100 text-red-800 border-red-200",
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
