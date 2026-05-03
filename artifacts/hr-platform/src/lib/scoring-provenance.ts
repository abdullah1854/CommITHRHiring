export type CacheReason =
  | "current_candidate_cache_key"
  | "durable_cache"
  | "normalized_resume_match"
  | "duplicate_resume_clone"
  | "same_resume_sha"
  | "file_cache"
  | "legacy_raw_response"
  | null
  | undefined;

export interface ScoringProvenanceInput {
  cacheReason?: CacheReason | string;
  cacheKey?: string | null;
  mode?: string | null;
  resumeFileSha?: string | null;
  createdAt?: string | Date | null;
  duplicateScoreCount?: number | null;
  duplicateCandidateCount?: number | null;
}

export interface ScoringProvenanceView {
  primaryBadge: "Fresh score" | "Reused score";
  badges: string[];
  detailLines: string[];
  createdDate: string | null;
}

const CACHE_REASON_COPY: Record<string, string> = {
  current_candidate_cache_key: "Existing score for this candidate/job/mode was reused.",
  durable_cache: "Durable score cache was reused for this job and CV fingerprint.",
  normalized_resume_match: "Same normalized CV text has been scored before for this job.",
  duplicate_resume_clone: "A previous candidate with the same CV fingerprint supplied this score.",
  same_resume_sha: "Same CV file hash has been scored before for this job.",
  file_cache: "Local screening cache pointed to the stored score.",
  legacy_raw_response: "Legacy screening cache metadata matched this run.",
};

export function formatScoreTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function buildScoringProvenance(input: ScoringProvenanceInput): ScoringProvenanceView {
  const cacheReason = typeof input.cacheReason === "string" ? input.cacheReason : null;
  const duplicateScoreCount = Math.max(0, Number(input.duplicateScoreCount ?? 0));
  const duplicateCandidateCount = Math.max(0, Number(input.duplicateCandidateCount ?? 0));
  const reused = Boolean(cacheReason) || duplicateScoreCount > 1 || duplicateCandidateCount > 1;
  const badges: string[] = [];
  const detailLines: string[] = [];
  const createdDate = formatScoreTimestamp(input.createdAt ?? null);

  if (cacheReason) badges.push("Reused score");
  if (duplicateCandidateCount > 1 || duplicateScoreCount > 1) badges.push("Duplicate CV");

  if (cacheReason && CACHE_REASON_COPY[cacheReason]) {
    detailLines.push(CACHE_REASON_COPY[cacheReason]);
  } else if (reused) {
    detailLines.push("Scoring metadata indicates this result was reused.");
  } else {
    detailLines.push("Generated specifically for this candidate/job pair.");
  }

  if (duplicateCandidateCount > 1) {
    detailLines.push(`${duplicateCandidateCount} candidates share this score fingerprint.`);
  } else if (duplicateScoreCount > 1) {
    detailLines.push(`${duplicateScoreCount} score records share this fingerprint.`);
  }

  if (createdDate) detailLines.push(`Scored ${createdDate}`);
  if (input.mode) detailLines.push(`Mode ${input.mode}`);
  if (input.cacheKey) detailLines.push(`Cache key ${input.cacheKey.slice(0, 12)}`);
  if (input.resumeFileSha) detailLines.push(`CV fingerprint ${input.resumeFileSha.slice(0, 12)}`);

  return {
    primaryBadge: reused ? "Reused score" : "Fresh score",
    badges: Array.from(new Set(badges)),
    detailLines,
    createdDate,
  };
}
