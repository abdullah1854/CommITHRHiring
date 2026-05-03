export type CandidateLike = {
  id: string;
  fullName: string;
  email?: string | null;
  status: string;
  skills?: string[];
  latestScore?: number | null;
  latestFit?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type OverviewLike = {
  totalOpenJobs?: number;
  totalCandidates?: number;
  totalInterviewsScheduled?: number;
  shortlistedCount?: number;
  rejectedCount?: number;
  pendingCount?: number;
  aiScreeningCount?: number;
  averageMatchScore?: number;
  hiresThisMonth?: number;
  newCandidatesThisWeek?: number;
};

export type HiringAction = {
  label: string;
  detail: string;
  tone: "blue" | "emerald" | "amber" | "purple";
};

export type HiringInsights = {
  healthScore: number;
  healthLabel: string;
  conversionRate: number;
  screeningCoverage: number;
  needsScreeningCount: number;
  staleReviewCount: number;
  topCandidates: CandidateLike[];
  actions: HiringAction[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: CandidateLike["updatedAt"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function buildHiringInsights(overview: OverviewLike | null | undefined, candidates: CandidateLike[] = []): HiringInsights {
  const totalCandidates = overview?.totalCandidates ?? candidates.length;
  const screenedCandidates = candidates.filter((candidate) => typeof candidate.latestScore === "number").length;
  const needsScreeningCount = Math.max(0, totalCandidates - (overview?.aiScreeningCount ?? screenedCandidates));
  const shortlistedCount = overview?.shortlistedCount ?? candidates.filter((candidate) => candidate.status === "shortlisted").length;
  const interviewCount = overview?.totalInterviewsScheduled ?? candidates.filter((candidate) => candidate.status === "interview_scheduled").length;
  const hires = overview?.hiresThisMonth ?? candidates.filter((candidate) => candidate.status === "hired").length;
  const averageScore = overview?.averageMatchScore ?? 0;

  const screeningCoverage = totalCandidates > 0 ? Math.round(((overview?.aiScreeningCount ?? screenedCandidates) / totalCandidates) * 100) : 100;
  const conversionRate = totalCandidates > 0 ? Math.round(((shortlistedCount + interviewCount + hires) / totalCandidates) * 100) : 0;

  const now = Date.now();
  const staleReviewCount = candidates.filter((candidate) => {
    if (!["new", "reviewing"].includes(candidate.status)) return false;
    const date = toDate(candidate.updatedAt ?? candidate.createdAt);
    return date ? now - date.getTime() > 5 * DAY_MS : false;
  }).length;

  const topCandidates = [...candidates]
    .filter((candidate) => typeof candidate.latestScore === "number")
    .sort((a, b) => (b.latestScore ?? 0) - (a.latestScore ?? 0))
    .slice(0, 3);

  const healthScore = clamp(
    Math.round(
      screeningCoverage * 0.34 +
      Math.min(conversionRate, 60) * 0.45 +
      Math.min(averageScore, 100) * 0.21 -
      Math.min(staleReviewCount * 4, 20),
    ),
  );

  const healthLabel = healthScore >= 80 ? "Excellent" : healthScore >= 65 ? "Healthy" : healthScore >= 45 ? "Needs focus" : "At risk";

  const actions: HiringAction[] = [];
  if (needsScreeningCount > 0) {
    actions.push({
      label: "Run AI screening",
      detail: `${needsScreeningCount} candidate${needsScreeningCount === 1 ? "" : "s"} still need a match score.`,
      tone: "purple",
    });
  }
  if (staleReviewCount > 0) {
    actions.push({
      label: "Clear stale reviews",
      detail: `${staleReviewCount} candidate${staleReviewCount === 1 ? "" : "s"} have been waiting more than 5 days.`,
      tone: "amber",
    });
  }
  if (topCandidates.length > 0) {
    actions.push({
      label: "Act on best matches",
      detail: `${topCandidates[0].fullName} is your highest-scoring candidate at ${topCandidates[0].latestScore}/100.`,
      tone: "emerald",
    });
  }
  if ((overview?.totalOpenJobs ?? 0) > 0 && totalCandidates === 0) {
    actions.push({
      label: "Source candidates",
      detail: "Open roles exist but the candidate pipeline is empty.",
      tone: "blue",
    });
  }
  if (actions.length === 0) {
    actions.push({
      label: "Pipeline is stable",
      detail: "No urgent bottlenecks detected. Keep nurturing top candidates.",
      tone: "emerald",
    });
  }

  return {
    healthScore,
    healthLabel,
    conversionRate,
    screeningCoverage: clamp(screeningCoverage),
    needsScreeningCount,
    staleReviewCount,
    topCandidates,
    actions: actions.slice(0, 3),
  };
}
