import OpenAI from "openai";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration (everything tunable lives in env)
// ---------------------------------------------------------------------------

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
// Question generation needs better instruction adherence than smaller models
// give. Allow per-call override; default to gpt-4o so smaller global model
// choices don't hurt question quality.
const QUESTIONS_MODEL = process.env.AI_QUESTIONS_MODEL || "gpt-4o";

// Optional: route question generation through OpenAI Responses API +
// web_search tool. NOTE: OpenAI rejects web_search combined with
// response_format=json_object (HTTP 400). Off by default until the JSON
// formatting path is reworked (json_schema mode or post-hoc parsing).
// Enable with AI_QUESTIONS_WEB_SEARCH=1 only if you've also adjusted the
// output format upstream.
const QUESTIONS_WEB_SEARCH =
  (process.env.AI_QUESTIONS_WEB_SEARCH ?? "0") === "1";

const REQUEST_TIMEOUT_MS = positiveInt(process.env.OPENAI_TIMEOUT_MS, 60_000);
const MAX_RETRIES = positiveInt(process.env.OPENAI_MAX_RETRIES, 2);

// Character caps for resume context per call. Long enough that strong CVs are
// not truncated, but bounded for cost/latency.
const RESUME_CONTEXT_CAP = positiveInt(process.env.AI_SCREEN_RESUME_CAP, 18_000);
// Deep scan uses the full resume (or close to it) so nothing is truncated and
// the model has the full context to corroborate every claim.
const DEEP_RESUME_CONTEXT_CAP = positiveInt(
  process.env.AI_DEEP_SCREEN_RESUME_CAP,
  32_000,
);
const SUMMARY_RESUME_CAP = positiveInt(process.env.AI_SUMMARY_RESUME_CAP, 8_000);
const QUESTIONS_RESUME_CAP = positiveInt(process.env.AI_QUESTIONS_RESUME_CAP, 4_000);
const PARSE_RESUME_CAP = positiveInt(process.env.AI_PARSE_RESUME_CAP, 8_000);
const SKILL_EXTRACT_CAP = positiveInt(process.env.AI_SKILL_EXTRACT_CAP, 6_000);

// Lower temperature for screening so scores are reproducible.
const SCREEN_TEMPERATURE = clampNumber(
  numberOrUndefined(process.env.AI_SCREEN_TEMPERATURE),
  0,
  2,
  0,
);
const GENERAL_TEMPERATURE = clampNumber(
  numberOrUndefined(process.env.AI_GENERAL_TEMPERATURE),
  0,
  2,
  0.4,
);

// OpenAI's "seed" parameter pushes the model toward deterministic sampling.
// Combined with temperature 0 it gives stable scores across re-runs for the
// same input. Override per-tenant if you want a different rotation.
const SCREEN_SEED = positiveInt(process.env.AI_SCREEN_SEED, 42);
// Bump this when the screening prompt changes — invalidates the cache below.
const SCREEN_PROMPT_VERSION = process.env.AI_SCREEN_PROMPT_VERSION || "v3";

// Token budgets per call type
const SCREEN_MAX_TOKENS = positiveInt(process.env.AI_SCREEN_MAX_TOKENS, 4_000);
const SUMMARY_MAX_TOKENS = positiveInt(process.env.AI_SUMMARY_MAX_TOKENS, 4_000);
const QUESTIONS_MAX_TOKENS = positiveInt(process.env.AI_QUESTIONS_MAX_TOKENS, 4_000);
const JD_MAX_TOKENS = positiveInt(process.env.AI_JD_MAX_TOKENS, 4_000);
const PARSE_MAX_TOKENS = positiveInt(process.env.AI_PARSE_MAX_TOKENS, 2_000);
const SKILL_MAX_TOKENS = positiveInt(process.env.AI_SKILL_MAX_TOKENS, 1_000);

// Brand voice for JD generation (kept generic; override per-tenant via env).
const BRAND_NAME = process.env.AI_BRAND_NAME?.trim() || "the company";
const BRAND_VOICE =
  process.env.AI_BRAND_VOICE?.trim() ||
  "professional, business-focused, emphasising governance, delivery discipline, accountability, ownership, and measurable outcomes";
const BRAND_LOCALE = process.env.AI_BRAND_LOCALE?.trim() || "British/Singapore English";

// Screening rubric weights (must be positive numbers — they are normalised to
// sum to 100 below). Defaults reflect: required skills + responsibilities are
// the dominant signal; experience/seniority/preferred skills are secondary.
const RUBRIC_WEIGHTS_RAW = {
  requiredSkills: positiveInt(process.env.AI_WEIGHT_REQUIRED, 30),
  responsibilities: positiveInt(process.env.AI_WEIGHT_RESPONSIBILITIES, 20),
  domainAlignment: positiveInt(process.env.AI_WEIGHT_DOMAIN, 15),
  experience: positiveInt(process.env.AI_WEIGHT_EXPERIENCE, 10),
  seniority: positiveInt(process.env.AI_WEIGHT_SENIORITY, 10),
  preferredSkills: positiveInt(process.env.AI_WEIGHT_PREFERRED, 10),
  achievements: positiveInt(process.env.AI_WEIGHT_ACHIEVEMENTS, 5),
};
const RUBRIC_WEIGHTS = normaliseWeights(RUBRIC_WEIGHTS_RAW);

const MOCK_REASONING = "Mock response — no OPENAI_API_KEY configured";
const FAIL_REASONING = "AI service unavailable";

const hasApiKey = Boolean(OPENAI_API_KEY);
console.log(
  `[aiService] init model=${OPENAI_MODEL} questionsModel=${QUESTIONS_MODEL} questionsWebSearch=${QUESTIONS_WEB_SEARCH} timeoutMs=${REQUEST_TIMEOUT_MS} ` +
    `screenCap=${RESUME_CONTEXT_CAP} retries=${MAX_RETRIES} hasApiKey=${hasApiKey}`,
);

const openai = new OpenAI({
  baseURL: OPENAI_BASE_URL,
  apiKey: OPENAI_API_KEY || "dummy",
  timeout: REQUEST_TIMEOUT_MS,
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function numberOrUndefined(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normaliseWeights<T extends Record<string, number>>(w: T): T {
  const sum = Object.values(w).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (sum <= 0) return w;
  const factor = 100 / sum;
  return Object.fromEntries(
    Object.entries(w).map(([k, v]) => [k, Math.round(v * factor * 1000) / 1000]),
  ) as T;
}

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { status?: number; code?: string; name?: string; message?: string };
  const status = anyErr.status;
  if (typeof status === "number" && (status === 408 || status === 429 || status >= 500)) return true;
  const code = anyErr.code ?? "";
  if (["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(code)) return true;
  const name = anyErr.name ?? "";
  if (name === "APIConnectionError" || name === "APITimeoutError") return true;
  const msg = (anyErr.message ?? "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("network")) return true;
  return false;
}

function tryRecoverJson(raw: string): any {
  if (!raw) return {};
  // Strip markdown code fences if the model wrapped output in ```json ... ```
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        /* fall through */
      }
    }
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

function clipResume(text: string, cap: number): string {
  if (!text) return "";
  if (text.length <= cap) return text;
  const omitted = text.length - cap;
  return `${text.slice(0, cap)}\n\n[… resume truncated; ${omitted} more characters omitted …]`;
}

type ChatParams = Parameters<typeof openai.chat.completions.create>[0];

async function callOpenAIResponsesJson<T = any>(
  callTag: string,
  args: {
    model: string;
    max_output_tokens: number;
    temperature: number;
    input: string;
    tools?: Array<{ type: string }>;
  },
  fallback: T,
): Promise<T> {
  if (!hasApiKey) {
    console.warn(`[aiService:${callTag}] no API key — returning fallback`);
    return fallback;
  }
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.responses.create({
        model: args.model,
        input: args.input,
        temperature: args.temperature,
        max_output_tokens: args.max_output_tokens,
        tools: args.tools,
        text: { format: { type: "json_object" } },
      } as any);

      const raw = (response as any).output_text ?? extractResponsesText(response);
      if (process.env.AI_IQ_DEBUG === "1") {
        console.log(
          `[aiService:${callTag}] raw response (first 500 chars): ${String(raw ?? "").slice(0, 500)}`,
        );
      }
      const parsed = tryRecoverJson(String(raw ?? ""));
      if (parsed == null) {
        console.warn(`[aiService:${callTag}] could not parse JSON from response`);
        return fallback;
      }
      return parsed as T;
    } catch (err) {
      lastErr = err;
      const transient = isTransientError(err);
      console.warn(
        `[aiService:${callTag}] attempt ${attempt + 1} failed (${transient ? "transient" : "fatal"}): ${(err as any)?.message ?? err}`,
      );
      if (!transient) break;
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
    }
  }
  console.error(`[aiService:${callTag}] all retries exhausted`, lastErr);
  return fallback;
}

function extractResponsesText(response: any): string {
  // Walk the structured output for the first text fragment we can find.
  const out = response?.output;
  if (!Array.isArray(out)) return "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (typeof c?.text === "string") return c.text;
      if (typeof c?.output_text === "string") return c.output_text;
    }
  }
  return "";
}

async function callOpenAIJson<T>(
  label: string,
  params: ChatParams,
  fallback: T,
): Promise<T> {
  if (!hasApiKey) {
    console.warn(`[aiService:${label}] No OPENAI_API_KEY configured — returning mock response`);
    return fallback;
  }

  const attempt = async (): Promise<any> => {
    const response = await openai.chat.completions.create({
      ...params,
      model: params.model ?? OPENAI_MODEL,
    });
    const content = (response as any)?.choices?.[0]?.message?.content ?? "{}";
    const parsed = tryRecoverJson(content);
    if (parsed === null) {
      throw new Error(`[aiService:${label}] Failed to parse JSON response`);
    }
    return parsed;
  };

  let lastError: unknown = null;
  for (let attemptNumber = 1; attemptNumber <= MAX_RETRIES + 1; attemptNumber++) {
    try {
      return (await attempt()) as T;
    } catch (err) {
      lastError = err;
      const transient = isTransientError(err);
      if (!transient || attemptNumber > MAX_RETRIES) break;
      const backoffMs = Math.min(8000, 250 * 2 ** (attemptNumber - 1));
      console.warn(
        `[aiService:${label}] Transient error (attempt ${attemptNumber}/${MAX_RETRIES + 1}) — retrying in ${backoffMs}ms:`,
        (err as Error)?.message ?? err,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  console.error(`[aiService:${label}] Call failed:`, (lastError as Error)?.message ?? lastError);
  return fallback;
}

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

interface LinkedInProfileShape {
  headline: string | null;
  about: string | null;
  skills: string[];
  experience: Array<{
    title: string | null;
    company: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  education: Array<{ school: string | null; degree: string | null; field: string | null }>;
  certifications: string[];
}

export type ScreeningMode = "standard" | "deep";

interface ScreeningInput {
  candidateName: string;
  resumeText: string;
  skills: string[];
  jobTitle: string;
  jobDescription: string;
  responsibilities: string;
  qualifications: string;
  requiredSkills: string[];
  preferredSkills: string[];
  seniority: string;
  minExperience?: number | null;
  maxExperience?: number | null;
  linkedinProfile?: LinkedInProfileShape | null;
  linkedinDiscrepancies?: string[];
  linkedinStatus?: string | null;
  // SHA256 of the resume file bytes. When present it replaces candidateName +
  // resumeText + skills in the cache key, so the same PDF yields the same
  // score regardless of any drift in LLM-extracted metadata.
  resumeFileSha?: string | null;
  // "standard" = default rubric + 18k char cap.
  // "deep"     = larger cap, stricter evidence rules, separate cache slot.
  mode?: ScreeningMode;
}

interface RubricDimension {
  score: number;
  weight: number;
  weighted: number;
  evidence: string;
}

export interface ScreeningOutput {
  matchScore: number;
  fitLabel: "strong_fit" | "moderate_fit" | "weak_fit";
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  risks: string[];
  reasoning: string;
  aiRecommendation: string;
  confidence: "high" | "medium" | "low";
  jobSpecQuality: "good" | "sparse" | "missing";
  rubric: Record<string, RubricDimension>;
  rawResponse: string;
}

const SCREEN_SYSTEM_PROMPT = `You are an expert technical recruiter. You evaluate candidates against a specific open requisition using ONLY evidence the resume actually contains. You never invent experience, never penalise a candidate for missing context that the JOB SPEC itself doesn't ask for, and never collapse a real career into a single-digit score because of cosmetic concerns. You return strict JSON only.`;

function describeExperienceRange(min: number | null | undefined, max: number | null | undefined): string {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);
  if (hasMin && hasMax) return `${min}-${max} years`;
  if (hasMin) return `${min}+ years`;
  if (hasMax) return `up to ${max} years`;
  return "not specified by the job posting";
}

function buildLinkedInBlock(input: ScreeningInput): string {
  const status = input.linkedinStatus ?? null;
  const profile = input.linkedinProfile ?? null;
  if (status === "verified" && profile) {
    return `\n=== LINKEDIN PROFILE (verified — use as ground truth) ===
Headline: ${profile.headline ?? "N/A"}
About: ${profile.about?.substring(0, 500) ?? "N/A"}
LinkedIn Skills: ${profile.skills.slice(0, 30).join(", ") || "none listed"}
Experience:
${profile.experience
  .slice(0, 6)
  .map((e) => `  - ${e.title ?? "?"} at ${e.company ?? "?"} (${e.startDate ?? "?"} → ${e.endDate ?? "present"})`)
  .join("\n")}
Education:
${profile.education
  .slice(0, 4)
  .map((e) => `  - ${e.degree ?? "?"} in ${e.field ?? "?"} at ${e.school ?? "?"}`)
  .join("\n")}
${profile.certifications.length > 0 ? `Certifications: ${profile.certifications.slice(0, 6).join(", ")}` : ""}
${
  input.linkedinDiscrepancies && input.linkedinDiscrepancies.length > 0
    ? `\n⚠ CV vs LinkedIn discrepancies:\n${input.linkedinDiscrepancies.map((d) => `  - ${d}`).join("\n")}`
    : "\n✓ No major CV vs LinkedIn discrepancies detected."
}`;
  }
  if (status === "not_found" || status === "failed") {
    return `\n=== LINKEDIN VERIFICATION ===
Status: ${status}. Profile could not be verified independently.
Mention this only as a small verification step in risks; do not reduce the score for this alone.`;
  }
  if (status === "skipped") {
    return `\n=== LINKEDIN VERIFICATION ===
LinkedIn verification was not configured. Treat the resume as the primary signal.`;
  }
  return `\n=== LINKEDIN VERIFICATION ===
No LinkedIn URL was parsed from the resume file. Many strong candidates omit LinkedIn on their PDF; do not treat this as proof of dishonesty.`;
}

const DEEP_SCAN_RIDER = `
=== DEEP SCAN MODE ===
This is a high-confidence review. Apply stricter evidence rules:
- For each rubric dimension cite TWO distinct evidence snippets from the resume / LinkedIn wherever possible. If only one is available, say so in evidence.
- In "risks", flag ambiguous claims (vague scope, unverified tenure, overlapping dates, responsibility listed without outcome).
- Only set confidence to "high" when evidence is corroborated (e.g. LinkedIn matches resume, tenure overlap is consistent, tools/domain specifics align).
- Prefer precise, quoted phrasing over paraphrase.`;

function buildScreeningPrompt(input: ScreeningInput): string {
  const jobSpecParts = [
    input.jobDescription,
    input.responsibilities,
    input.qualifications,
    ...(input.requiredSkills ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const jobSpecLength = jobSpecParts.trim().length;
  const linkedinBlock = buildLinkedInBlock(input);

  const requiredSkills = (input.requiredSkills ?? []).join(", ") || "(none specified)";
  const preferredSkills = (input.preferredSkills ?? []).join(", ") || "(none specified)";
  const seniority = input.seniority?.trim() || "not specified";
  const expRange = describeExperienceRange(input.minExperience, input.maxExperience);
  const mode: ScreeningMode = input.mode === "deep" ? "deep" : "standard";
  const resumeCap = mode === "deep" ? DEEP_RESUME_CONTEXT_CAP : RESUME_CONTEXT_CAP;
  const modeRider = mode === "deep" ? DEEP_SCAN_RIDER : "";

  return `Evaluate the candidate against this open requisition. Return strict JSON.${modeRider}

=== JOB SPEC ===
Title: ${input.jobTitle}
Seniority: ${seniority}
Experience expected: ${expRange}
Required skills (must-have): ${requiredSkills}
Preferred skills (nice-to-have): ${preferredSkills}
Description:
${(input.jobDescription || "").trim() || "(missing — base scoring on title + responsibilities only)"}
Responsibilities:
${(input.responsibilities || "").trim() || "(missing)"}
Qualifications:
${(input.qualifications || "").trim() || "(missing)"}

Spec quality hint: total spec length is ${jobSpecLength} characters. If the spec is sparse or missing entirely, set jobSpecQuality to "sparse" or "missing" and DO NOT punish the candidate for our weak job spec — score them on what the spec does describe.

=== CANDIDATE ===
Name: ${input.candidateName}
Skills (parsed): ${(input.skills ?? []).join(", ") || "(none parsed)"}
Resume text:
${clipResume(input.resumeText, resumeCap)}
${linkedinBlock}

=== EVALUATION RUBRIC ===
Score the candidate from 0-100 on each dimension below using only evidence from the resume (and LinkedIn if verified). Cite a one-line "evidence" string per dimension that quotes or paraphrases the resume passage you used. If the rubric dimension does not apply (e.g. the JD lists no preferred skills), set score to null and put "not applicable" as evidence — DO NOT default to 0.

Dimensions:
1. requiredSkills        — Coverage of must-have skills. Equivalents and synonyms count (e.g. "Agile" ≈ "Scrum"; "ERP implementation" ≈ "SAP/Workday rollouts"). 100 = covers all required skills with depth.
2. responsibilities      — Has the candidate actually done the work this role demands? 100 = clear track record on most listed responsibilities.
3. domainAlignment       — Industry/functional domain fit (e.g. finance vs healthcare; B2B SaaS vs gov; oil & gas vs retail).
4. experience            — Years and depth vs expected range. Treat over-qualified the same as in-range unless the JD explicitly excludes it.
5. seniority             — Operating level signals: scope, ownership, leadership, autonomy.
6. preferredSkills       — Coverage of nice-to-have skills.
7. achievements          — Concrete, measurable impact (numbers, scale, outcomes).

=== SCORING DISCIPLINE ===
- Single-digit scores (0-15) MUST mean "wrong profession or no real overlap with this role". A candidate with multi-year domain-relevant experience cannot land in this band based on missing keywords alone.
- 16-35 = some transferable skills, major gaps on the must-haves.
- 36-55 = partial fit, would need significant ramp-up.
- 56-74 = solid fit with clear gaps that are coachable.
- 75-89 = strong fit, hire-loop candidate.
- 90-100 = exceptional/standout match.
- Required skills carry the most weight; preferred skills are tie-breakers.
- Synonyms, transferable experience, and modern tool equivalents COUNT — match on capability, not literal keyword overlap.
- If the resume is rich but the JD is thin, lean toward a moderate score and flag jobSpecQuality.

=== OUTPUT (JSON ONLY) ===
{
  "dimensions": {
    "requiredSkills":   { "score": <0-100|null>, "evidence": "<resume-grounded one-liner>", "matched": ["..."], "missing": ["..."] },
    "responsibilities": { "score": <0-100|null>, "evidence": "..." },
    "domainAlignment":  { "score": <0-100|null>, "evidence": "..." },
    "experience":       { "score": <0-100|null>, "evidence": "...", "candidateYears": <number|null>, "expectedRange": "${expRange}" },
    "seniority":        { "score": <0-100|null>, "evidence": "..." },
    "preferredSkills":  { "score": <0-100|null>, "evidence": "...", "matched": ["..."], "missing": ["..."] },
    "achievements":     { "score": <0-100|null>, "evidence": "..." }
  },
  "strengths":     ["3-5 strengths tied to THIS job, each cites resume evidence"],
  "risks":         ["2-5 risks/gaps for THIS job; only mention LinkedIn verification if status was failed/discrepant"],
  "overallReasoning": "<2-3 sentence narrative consistent with the dimension scores above>",
  "aiRecommendation": "<one of: schedule interview / second-look / hold / not a fit — followed by a one-sentence reason>",
  "confidence":      "<high|medium|low>",
  "jobSpecQuality":  "<good|sparse|missing>"
}

Rules:
- Return strict JSON; no markdown fences, no commentary outside JSON.
- Cite only evidence the resume actually contains.
- Never recommend final rejection — recommend interview, second-look, hold, or "not a fit (with reason)".`;
}

function buildFallbackScreening(): ScreeningOutput {
  const reasoning = hasApiKey ? FAIL_REASONING : MOCK_REASONING;
  const dims: Record<string, RubricDimension> = {};
  for (const [k, weight] of Object.entries(RUBRIC_WEIGHTS)) {
    dims[k] = { score: 0, weight, weighted: 0, evidence: reasoning };
  }
  return {
    matchScore: 0,
    fitLabel: "weak_fit",
    matchedSkills: [],
    missingSkills: [],
    strengths: [],
    risks: [reasoning],
    reasoning,
    aiRecommendation: "Manual review required — AI screening did not return a usable response.",
    confidence: "low",
    jobSpecQuality: "good",
    rubric: dims,
    rawResponse: "",
  };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim().length > 0);
}

function fitLabelFromScore(score: number): "strong_fit" | "moderate_fit" | "weak_fit" {
  if (score >= 75) return "strong_fit";
  if (score >= 50) return "moderate_fit";
  return "weak_fit";
}

/**
 * Stable hash of every input that influences the screening output. If we have
 * already produced a result for this exact (resume, job, model, prompt, mode)
 * combination, the route layer can short-circuit instead of re-asking the LLM
 * — guaranteeing identical scores between re-runs.
 *
 * When `resumeFileSha` is provided, the hash of the PDF bytes is the resume's
 * identity — LLM-extracted fields (candidate name, skills list, experience
 * summary) are excluded so re-uploading the same file never changes the cache
 * key. Legacy callers without a sha fall back to the old behaviour.
 */
export function screeningCacheKey(input: ScreeningInput): string {
  const mode: ScreeningMode = input.mode === "deep" ? "deep" : "standard";
  const hasSha = typeof input.resumeFileSha === "string" && input.resumeFileSha.length > 0;

  const resumeIdentity = hasSha
    ? { kind: "sha256", value: input.resumeFileSha }
    : {
        kind: "legacy",
        candidateName: input.candidateName ?? "",
        skills: [...(input.skills ?? [])].sort(),
        resumeText: input.resumeText ?? "",
      };

  const payload = JSON.stringify({
    promptVersion: SCREEN_PROMPT_VERSION,
    model: OPENAI_MODEL,
    seed: SCREEN_SEED,
    temperature: SCREEN_TEMPERATURE,
    weights: RUBRIC_WEIGHTS,
    mode,
    resume: resumeIdentity,
    jobTitle: input.jobTitle ?? "",
    jobDescription: input.jobDescription ?? "",
    responsibilities: input.responsibilities ?? "",
    qualifications: input.qualifications ?? "",
    requiredSkills: [...(input.requiredSkills ?? [])].sort(),
    preferredSkills: [...(input.preferredSkills ?? [])].sort(),
    seniority: input.seniority ?? "",
    minExperience: input.minExperience ?? null,
    maxExperience: input.maxExperience ?? null,
    linkedinStatus: input.linkedinStatus ?? null,
    linkedinDiscrepancies: input.linkedinDiscrepancies ?? [],
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function screenCandidate(input: ScreeningInput): Promise<ScreeningOutput> {
  const mode: ScreeningMode = input.mode === "deep" ? "deep" : "standard";
  const prompt = buildScreeningPrompt(input);
  // Deep scan produces more evidence per dimension, so give the model more
  // token headroom to avoid truncated JSON.
  const maxTokens = mode === "deep" ? Math.max(SCREEN_MAX_TOKENS, 6_000) : SCREEN_MAX_TOKENS;

  const result = await callOpenAIJson<any>(
    `screenCandidate:${mode}`,
    {
      model: OPENAI_MODEL,
      max_completion_tokens: maxTokens,
      temperature: SCREEN_TEMPERATURE,
      // OpenAI's documented determinism toggle. Same seed + temperature 0 +
      // unchanged prompt should produce repeatable scores.
      seed: SCREEN_SEED,
      messages: [
        { role: "system", content: SCREEN_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    } as any,
    null,
  );

  if (!result || typeof result !== "object") return buildFallbackScreening();

  const dimsRaw = (result.dimensions ?? {}) as Record<string, any>;

  // Aggregate weighted score deterministically. Dimensions the model marks as
  // null/non-applicable are skipped and their weight is redistributed across
  // the remaining dimensions, so we never penalise candidates for things the
  // job spec didn't ask for.
  const applicable: Array<{ key: string; score: number; weight: number; evidence: string }> = [];
  for (const [key, weight] of Object.entries(RUBRIC_WEIGHTS)) {
    const raw = dimsRaw[key];
    const rawScore = raw?.score;
    const evidence = typeof raw?.evidence === "string" ? raw.evidence : "";
    if (rawScore == null) continue;
    const numericScore = clampNumber(Number(rawScore), 0, 100, NaN);
    if (Number.isNaN(numericScore)) continue;
    applicable.push({ key, score: numericScore, weight, evidence });
  }

  let matchScore = 0;
  const rubric: Record<string, RubricDimension> = {};
  if (applicable.length > 0) {
    const totalWeight = applicable.reduce((s, d) => s + d.weight, 0) || 100;
    for (const d of applicable) {
      const normWeight = (d.weight / totalWeight) * 100;
      const weighted = (d.score * normWeight) / 100;
      matchScore += weighted;
      rubric[d.key] = {
        score: Math.round(d.score),
        weight: Math.round(normWeight * 100) / 100,
        weighted: Math.round(weighted * 100) / 100,
        evidence: d.evidence,
      };
    }
  } else {
    // Model returned no usable dimensions — fall back to its own freeform fields if any.
    matchScore = clampNumber(Number(result.matchScore), 0, 100, 0);
  }

  // Soft adjustments based on LinkedIn evidence (verifiable, bounded).
  const discrepancyCount = Array.isArray(input.linkedinDiscrepancies) ? input.linkedinDiscrepancies.length : 0;
  if (discrepancyCount > 0) {
    matchScore = Math.max(0, matchScore - Math.min(15, discrepancyCount * 4));
  }

  matchScore = clampNumber(matchScore, 0, 100, 0);
  matchScore = Math.round(matchScore);

  const fitLabel = fitLabelFromScore(matchScore);

  const reqDim = dimsRaw.requiredSkills ?? {};
  const prefDim = dimsRaw.preferredSkills ?? {};
  const matchedSkills = Array.from(
    new Set([...asStringArray(reqDim.matched), ...asStringArray(prefDim.matched)]),
  );
  const missingSkills = Array.from(
    new Set([...asStringArray(reqDim.missing), ...asStringArray(prefDim.missing)]),
  );

  const strengths = asStringArray(result.strengths);
  const risks = asStringArray(result.risks);
  if (discrepancyCount > 0) {
    risks.push(`LinkedIn discrepancies detected (${discrepancyCount}) — verify before next stage.`);
  }

  const reasoning = typeof result.overallReasoning === "string" && result.overallReasoning.trim().length > 0
    ? result.overallReasoning.trim()
    : typeof result.reasoning === "string"
    ? result.reasoning.trim()
    : "";

  const recommendation = typeof result.aiRecommendation === "string" ? result.aiRecommendation.trim() : "";
  const confidence: "high" | "medium" | "low" =
    result.confidence === "high" || result.confidence === "low" ? result.confidence : "medium";
  const jobSpecQuality: "good" | "sparse" | "missing" =
    result.jobSpecQuality === "sparse" || result.jobSpecQuality === "missing"
      ? result.jobSpecQuality
      : "good";

  return {
    matchScore,
    fitLabel,
    matchedSkills,
    missingSkills,
    strengths,
    risks,
    reasoning,
    aiRecommendation: recommendation,
    confidence,
    jobSpecQuality,
    rubric,
    rawResponse: JSON.stringify({
      computedScore: matchScore,
      computedFit: fitLabel,
      weightsUsed: RUBRIC_WEIGHTS,
      cacheKey: screeningCacheKey(input),
      mode,
      promptVersion: SCREEN_PROMPT_VERSION,
      model: OPENAI_MODEL,
      modelOutput: result,
    }),
  };
}

// ---------------------------------------------------------------------------
// Candidate Summary
// ---------------------------------------------------------------------------

interface SummaryOutput {
  overallSummary: string;
  experienceSnapshot: string;
  strengths: string[];
  risks: string[];
  likelyFitAreas: string[];
  missingCapabilities: string[];
  recommendationNotes: string;
}

export async function generateCandidateSummary(opts: {
  candidateName: string;
  resumeText: string;
  skills: string[];
  experienceSummary?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  jobResponsibilities?: string | null;
  jobQualifications?: string | null;
  jobDepartment?: string | null;
  jobSeniority?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  screeningScore?: number | null;
  fitLabel?: string | null;
  matchedSkills?: string[];
  missingSkills?: string[];
  screeningReasoning?: string | null;
}): Promise<SummaryOutput> {
  const hasScreening = opts.screeningScore != null && opts.fitLabel != null;
  const hasJob = Boolean(opts.jobTitle?.trim());

  const jobBlock = hasJob
    ? `
=== OPEN POSITION (evaluate fit for THIS role only) ===
Title: ${opts.jobTitle}
Department: ${opts.jobDepartment ?? "N/A"}
Seniority: ${opts.jobSeniority ?? "N/A"}
Required skills: ${(opts.requiredSkills ?? []).join(", ") || "N/A"}
Preferred skills: ${(opts.preferredSkills ?? []).join(", ") || "N/A"}
Description:
${(opts.jobDescription ?? "").slice(0, 2000)}
Responsibilities:
${(opts.jobResponsibilities ?? "").slice(0, 2000)}
Qualifications:
${(opts.jobQualifications ?? "").slice(0, 1500)}

The entire summary must judge the candidate against THIS requisition. If the candidate is weak for this role, say so plainly in terms of THIS job's requirements; you may add at most one short secondary sentence about alternative directions.`
    : "";

  const screeningBlock = hasScreening
    ? `
=== JOB FIT ASSESSMENT (same requisition) ===
AI Fit Score: ${opts.screeningScore}/100 (${opts.fitLabel?.replace(/_/g, " ")})
Matched Skills: ${(opts.matchedSkills ?? []).join(", ") || "none"}
Skill Gaps: ${(opts.missingSkills ?? []).join(", ") || "none"}
Screening Reasoning: ${opts.screeningReasoning ?? "N/A"}

The summary MUST be consistent with this assessment.`
    : "";

  const prompt = `You are an expert HR assistant. Produce a candidate summary scoped to the OPEN POSITION below.

=== CANDIDATE ===
Name: ${opts.candidateName}
Skills: ${(opts.skills ?? []).join(", ")}
Experience Summary: ${opts.experienceSummary ?? "N/A"}
Resume excerpt:
${clipResume(opts.resumeText, SUMMARY_RESUME_CAP)}
${jobBlock}
${screeningBlock}

Return JSON (every field is relative to the OPEN POSITION above):
{
  "overallSummary": "<2-3 sentences: fit for THIS role>",
  "experienceSnapshot": "<2-3 sentences of evidence from their background that matters for THIS job>",
  "strengths": [<4-6 strengths tied to THIS role's needs>],
  "risks": [<2-4 gaps or concerns for THIS role specifically>],
  "likelyFitAreas": [<3-4 aspects of THIS role/domain where the candidate aligns>],
  "missingCapabilities": [<gaps vs THIS role's requirements>],
  "recommendationNotes": "<actionable next step for THIS pipeline>"
}`;

  const fallback: SummaryOutput = {
    overallSummary: hasApiKey ? FAIL_REASONING : MOCK_REASONING,
    experienceSnapshot: "",
    strengths: [],
    risks: [],
    likelyFitAreas: [],
    missingCapabilities: [],
    recommendationNotes: hasApiKey ? FAIL_REASONING : MOCK_REASONING,
  };

  const result = await callOpenAIJson<any>(
    "generateCandidateSummary",
    {
      model: OPENAI_MODEL,
      max_completion_tokens: SUMMARY_MAX_TOKENS,
      temperature: GENERAL_TEMPERATURE,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    },
    null,
  );

  if (!result) return fallback;

  return {
    overallSummary: typeof result.overallSummary === "string" ? result.overallSummary : "",
    experienceSnapshot: typeof result.experienceSnapshot === "string" ? result.experienceSnapshot : "",
    strengths: asStringArray(result.strengths),
    risks: asStringArray(result.risks),
    likelyFitAreas: asStringArray(result.likelyFitAreas),
    missingCapabilities: asStringArray(result.missingCapabilities),
    recommendationNotes: typeof result.recommendationNotes === "string" ? result.recommendationNotes : "",
  };
}

// ---------------------------------------------------------------------------
// Interview Questions
// ---------------------------------------------------------------------------

export type InterviewQuestionType =
  | "technical"
  | "behavioral"
  | "roleSpecific"
  | "followUp";

const ALL_QUESTION_TYPES: readonly InterviewQuestionType[] = [
  "technical",
  "behavioral",
  "roleSpecific",
  "followUp",
] as const;

interface InterviewQuestionsOutput {
  technical: string[];
  behavioral: string[];
  roleSpecific: string[];
  followUp: string[];
}

interface InterviewQuestionsInput {
  candidateName: string;
  resumeText: string;
  skills: string[];
  missingSkills: string[];
  jobTitle: string;
  seniority: string;
  jobDescription: string;
  responsibilities?: string;
  qualifications?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  department?: string;
  focus?: string;
  types?: InterviewQuestionType[];
}

const COUNT_BY_TYPE_AND_SELECTION: Record<
  number,
  Partial<Record<InterviewQuestionType, string>>
> = {
  4: {
    technical: "10",
    behavioral: "4-5",
    roleSpecific: "4-5",
    followUp: "3-4",
  },
  3: {
    technical: "10",
    behavioral: "5-6",
    roleSpecific: "5-6",
    followUp: "5-6",
  },
  2: {
    technical: "10",
    behavioral: "8-9",
    roleSpecific: "8-9",
    followUp: "8-9",
  },
  1: {
    technical: "10",
    behavioral: "15-18",
    roleSpecific: "15-18",
    followUp: "15-18",
  },
};

const COUNT_AS_NUMBER: Record<string, number> = {
  "10": 10,
  "8-9": 9,
  "5-6": 6,
  "4-5": 5,
  "3-4": 4,
  "15-18": 17,
  "12-15": 14,
};

function slotsFor(
  type: InterviewQuestionType,
  countStr: string,
  focus: string,
): string[] {
  const n = COUNT_AS_NUMBER[countStr] ?? 5;
  const slots: string[] = [];
  if (type === "technical" && focus) {
    // First 4: focus-grounded
    for (let i = 1; i <= 4 && i <= n; i++) {
      slots.push(`"<question ${i}: must name a focus term ('${focus}') and probe it via candidate's resume>"`);
    }
    // Remaining: JD-grounded
    for (let i = 5; i <= n; i++) {
      slots.push(`"<question ${i}: must name a Required/Preferred Skill from the JD applied to candidate's experience>"`);
    }
  } else if (type === "technical") {
    for (let i = 1; i <= n; i++) {
      slots.push(`"<question ${i}: must name a Required/Preferred Skill from the JD applied to candidate's experience>"`);
    }
  } else if (type === "behavioral") {
    for (let i = 1; i <= n; i++) {
      slots.push(`"<question ${i}: must reference a SPECIFIC past project/employer/claim from this candidate's resume by name. NOT generic STAR format.>"`);
    }
  } else if (type === "roleSpecific") {
    for (let i = 1; i <= n; i++) {
      slots.push(`"<question ${i}: scenario naming a concrete responsibility from the JD applied to this candidate's background>"`);
    }
  } else {
    for (let i = 1; i <= n; i++) {
      slots.push(`"<question ${i}: probes a named skill gap or unverified resume claim>"`);
    }
  }
  return slots;
}

export function buildInterviewQuestionsPrompt(opts: InterviewQuestionsInput): {
  prompt: string;
  types: InterviewQuestionType[];
} {
  const requestedRaw = opts.types ?? [...ALL_QUESTION_TYPES];
  const types = requestedRaw.filter((t): t is InterviewQuestionType =>
    (ALL_QUESTION_TYPES as readonly string[]).includes(t),
  );
  const selected = types.length === 0 ? [...ALL_QUESTION_TYPES] : types;

  const counts = COUNT_BY_TYPE_AND_SELECTION[selected.length] ?? {};
  const requiredSkills = (opts.requiredSkills ?? []).join(", ") || "n/a";
  const preferredSkills = (opts.preferredSkills ?? []).join(", ") || "n/a";
  const responsibilities = (opts.responsibilities ?? "").trim() || "n/a";
  const qualifications = (opts.qualifications ?? "").trim() || "n/a";
  const department = opts.department?.trim() || "n/a";
  const focus = (opts.focus ?? "")
    .replace(/[\r\n"]/g, " ")
    .trim();

  const focusBlock = focus
    ? `\n=== PRIMARY FOCUS ===\nAll questions must center on or probe: "${focus}".\nOther JD topics are secondary; allocate at most 25% of questions to non-focus areas.\n`
    : "";

  const technicalFocusRule =
    focus && selected.includes("technical")
      ? `\n2a. The TECHNICAL category MUST include at least 4 questions whose primary subject IS one of the FOCUS terms ("${focus}"). These 4 questions must each name a specific focus term in the question text. The remaining 6 technical questions cover Required/Preferred Skills from the JD.\n`
      : "";

  const outputShape = selected
    .map((t) => {
      const countStr = counts[t] ?? "4-5";
      const slots = slotsFor(t, countStr, focus);
      return `  "${t}": [\n    ${slots.join(",\n    ")}\n  ]`;
    })
    .join(",\n");

  const prompt = `You are interviewing ${opts.candidateName} for a ${opts.seniority} ${opts.jobTitle} role. Generate interview questions that could ONLY be asked of THIS candidate for THIS job. Generic textbook questions are unacceptable.
${focusBlock}
=== JOB ===
Title: ${opts.jobTitle}
Seniority: ${opts.seniority}
Department: ${department}
Required Skills: ${requiredSkills}
Preferred Skills: ${preferredSkills}
Responsibilities:
${responsibilities.substring(0, 1500)}
Qualifications:
${qualifications.substring(0, 1000)}
Job Description:
${(opts.jobDescription ?? "").substring(0, 1200)}

=== CANDIDATE ===
Name: ${opts.candidateName}
Skills on resume: ${(opts.skills ?? []).join(", ") || "n/a"}
Skill gaps vs job: ${(opts.missingSkills ?? []).join(", ") || "none"}
Resume excerpt:
${clipResume(opts.resumeText, QUESTIONS_RESUME_CAP)}

=== HARD RULES ===
1. EVERY question must contain at least one specific noun phrase taken verbatim (or near-verbatim) from the resume, the JD's Required/Preferred Skills, the JD's Responsibilities, or the FOCUS area above. No abstract questions.
2. ${focus ? `At least 60% of questions across ALL categories must explicitly mention one of the FOCUS terms by name.` : `Distribute questions across the candidate's resume claims and the JD's Required/Preferred Skills.`}
${technicalFocusRule}3. BANNED OPENING PATTERNS (do not start any question with these or close paraphrases):
   - "Tell me about a time you..."
   - "Describe a situation where you..."
   - "Can you provide an example of..."
   - "Can you describe / explain your experience with..." (without naming a specific resume employer/project)
   - "Have you ever..."
   - "How did you handle..."
   - "What is your approach to..."
   - "Walk me through a project where you..." (without naming the project)
4. BANNED TOPICS: do NOT ask about "strengths", "weaknesses", "5-year goals", "challenging coworkers", "team collaboration in general", "communicating with non-technical audiences" UNLESS you tie the question to a specific resume project or focus area.
5. Do NOT introduce technologies, employers, or domains that are not in the resume, JD, or focus area.

=== GOOD vs BAD EXAMPLES ===
GOOD: "Your resume lists a 2023 AWS migration at <Employer>. Walk me through how you sequenced the cutover and what you'd do differently if you ran the same migration onto our internal platform."
BAD:  "Tell me about a migration project you've worked on."

GOOD: "<Employer> ran on Active Directory per your resume — what GPO conflicts have you debugged, and what's your process when the symptom is intermittent login failure?"
BAD:  "Describe your experience with Active Directory."

GOOD (focus="AWS migration"): "Our role calls for AWS migration work — given your prior <specific project>, how would you decide between RDS Multi-AZ and a standalone read replica for our payment ledger workload?"
BAD: "Can you describe your AWS experience?"

=== SELF-CHECK BEFORE RETURNING ===
For each question you generate, silently verify:
(a) it contains at least one specific noun phrase from resume/JD/focus,
(b) it does NOT start with a banned pattern,
(c) it could not be reused verbatim for a different candidate or different job.
If any question fails, rewrite it.

Return JSON with EXACTLY these keys (no others). EVERY array slot below must be filled with a real question — do NOT collapse, omit, or shorten the arrays. Each slot's bracketed text describes what that specific question must be about.
{
${outputShape}
}`;

  return { prompt, types: selected };
}

export async function generateInterviewQuestions(
  opts: InterviewQuestionsInput,
): Promise<InterviewQuestionsOutput> {
  const { prompt, types: selected } = buildInterviewQuestionsPrompt(opts);

  const fallback: InterviewQuestionsOutput = {
    technical: [],
    behavioral: [],
    roleSpecific: [],
    followUp: [],
  };

  if (process.env.AI_IQ_DEBUG === "1") {
    console.log("[ai:iq:debug] prompt START\n" + prompt + "\n[ai:iq:debug] prompt END");
    console.log(`[ai:iq:debug] using ${QUESTIONS_WEB_SEARCH ? "Responses API + web_search" : "chat.completions"}`);
  }

  const result = QUESTIONS_WEB_SEARCH
    ? await callOpenAIResponsesJson<any>(
        "generateInterviewQuestions",
        {
          model: QUESTIONS_MODEL,
          max_output_tokens: QUESTIONS_MAX_TOKENS,
          temperature: GENERAL_TEMPERATURE,
          input: prompt,
          tools: [{ type: "web_search" }],
        },
        null,
      )
    : await callOpenAIJson<any>(
        "generateInterviewQuestions",
        {
          model: QUESTIONS_MODEL,
          max_completion_tokens: QUESTIONS_MAX_TOKENS,
          temperature: GENERAL_TEMPERATURE,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        },
        null,
      );

  if (!result) return fallback;

  if (process.env.AI_IQ_DEBUG === "1") {
    console.log(
      "[ai:iq:debug] response keys=" +
        Object.keys(result ?? {}).join(",") +
        " counts=" +
        selected
          .map((t) => `${t}:${Array.isArray(result[t]) ? result[t].length : "n/a"}`)
          .join(" "),
    );
  }

  const out: InterviewQuestionsOutput = { ...fallback };
  for (const t of selected) {
    out[t] = asStringArray(result[t]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Job Description generation / improvement
// ---------------------------------------------------------------------------

interface GeneratedJDOutput {
  title?: string;
  description: string;
  responsibilities: string;
  qualifications: string;
  requiredSkills: string[];
  preferredSkills: string[];
  interviewFocusAreas: string[];
}

const JD_SYSTEM_PROMPT = `You are an expert HR copywriter writing for ${BRAND_NAME}. Voice: ${BRAND_VOICE}. Use ${BRAND_LOCALE} spelling. Avoid filler phrases ("exciting opportunity", "rockstar", "ninja"). No emojis. Use third-person / imperative voice ("Lead", "Own", "Provide"), never "you will".`;

const JD_STYLE_GUIDE = `=== JD STYLE ===
DESCRIPTION: 2 short paragraphs. Paragraph 1 opens with the role's purpose and the top attributes the role demands. Paragraph 2 describes what the successful candidate demonstrates (ownership, proactive risk/budget/dependency management, decisiveness, balance of strategy and execution) and the measurable outcomes expected.

RESPONSIBILITIES: Multi-line string grouped under 3-5 category headers. Each category header on its own line (no prefix). Each sub-bullet on its own line starting with 'o ' (lowercase o + space). Blank line between categories. Sub-bullets use strong active verbs (Lead, Own, Drive, Establish, Enforce, Deliver) and reference real artefacts (steering committees, governance forums, risk registers, program syncs, variance management, change control).

QUALIFICATIONS: Multi-line string. Each qualification on its own line starting with '• ' (bullet + space). Order: years of experience → domain depth → scope of programs managed → soft-skill qualities → certifications.`;

export async function generateJobDescription(opts: {
  prompt: string;
  department?: string;
  seniority?: string;
  employmentType?: string;
}): Promise<GeneratedJDOutput> {
  const userPrompt = `Generate a complete job description for ${BRAND_NAME} based on:
Prompt: ${opts.prompt}
${opts.department ? `Department: ${opts.department}` : ""}
${opts.seniority ? `Seniority: ${opts.seniority}` : ""}
${opts.employmentType ? `Type: ${opts.employmentType}` : ""}

${JD_STYLE_GUIDE}

=== OUTPUT (JSON) ===
{
  "title": "<concise job title>",
  "description": "<2 paragraphs, newline-separated>",
  "responsibilities": "<category headers + 'o ' sub-bullets>",
  "qualifications": "<'• ' bullets>",
  "requiredSkills": [<5-8 specific skills/competencies/tools tied to the role>],
  "preferredSkills": [<3-5 differentiating preferred skills>],
  "interviewFocusAreas": [<4-5 areas to probe in interview, aligned with the role's top risks and accountabilities>]
}

Rules:
- Match the seniority level in tone (senior roles emphasise governance, accountability, executive communication; junior roles emphasise execution, learning, delivery support).
- Every responsibility sub-bullet should be measurable or observable.
- Keep the language tight; no marketing fluff.`;

  const fallback: GeneratedJDOutput = {
    description: hasApiKey ? FAIL_REASONING : MOCK_REASONING,
    responsibilities: "",
    qualifications: "",
    requiredSkills: [],
    preferredSkills: [],
    interviewFocusAreas: [],
  };

  const result = await callOpenAIJson<any>(
    "generateJobDescription",
    {
      model: OPENAI_MODEL,
      max_completion_tokens: JD_MAX_TOKENS,
      temperature: GENERAL_TEMPERATURE,
      messages: [
        { role: "system", content: JD_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    },
    null,
  );

  if (!result) return fallback;
  return {
    title: typeof result.title === "string" ? result.title : undefined,
    description: typeof result.description === "string" ? result.description : "",
    responsibilities: typeof result.responsibilities === "string" ? result.responsibilities : "",
    qualifications: typeof result.qualifications === "string" ? result.qualifications : "",
    requiredSkills: asStringArray(result.requiredSkills),
    preferredSkills: asStringArray(result.preferredSkills),
    interviewFocusAreas: asStringArray(result.interviewFocusAreas),
  };
}

export async function improveJobDescription(opts: {
  existingJD: string;
  focusAreas?: string[];
}): Promise<GeneratedJDOutput> {
  const userPrompt = `Rewrite this job description in the ${BRAND_NAME} voice (see system message). ${BRAND_LOCALE}. No filler, no emojis, no second-person.

EXISTING JD:
${opts.existingJD}

${opts.focusAreas?.length ? `Focus on improving: ${opts.focusAreas.join(", ")}` : ""}

${JD_STYLE_GUIDE}

Return JSON:
{
  "description": "<2 paragraphs, newline-separated>",
  "responsibilities": "<category headers + 'o ' sub-bullets>",
  "qualifications": "<'• ' bullets>",
  "requiredSkills": [<required skills list>],
  "preferredSkills": [<preferred skills list>],
  "interviewFocusAreas": [<4-5 focus areas aligned with role's top risks and accountabilities>]
}`;

  const fallback: GeneratedJDOutput = {
    description: hasApiKey ? FAIL_REASONING : MOCK_REASONING,
    responsibilities: "",
    qualifications: "",
    requiredSkills: [],
    preferredSkills: [],
    interviewFocusAreas: [],
  };

  const result = await callOpenAIJson<any>(
    "improveJobDescription",
    {
      model: OPENAI_MODEL,
      max_completion_tokens: JD_MAX_TOKENS,
      temperature: GENERAL_TEMPERATURE,
      messages: [
        { role: "system", content: JD_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    },
    null,
  );

  if (!result) return fallback;
  return {
    description: typeof result.description === "string" ? result.description : "",
    responsibilities: typeof result.responsibilities === "string" ? result.responsibilities : "",
    qualifications: typeof result.qualifications === "string" ? result.qualifications : "",
    requiredSkills: asStringArray(result.requiredSkills),
    preferredSkills: asStringArray(result.preferredSkills),
    interviewFocusAreas: asStringArray(result.interviewFocusAreas),
  };
}

// ---------------------------------------------------------------------------
// Resume parsing helpers (LLM-assisted)
// ---------------------------------------------------------------------------

export async function extractSkillsFromResume(resumeText: string): Promise<string[]> {
  const prompt = `Extract a list of technical and professional skills from this resume text. Return only a JSON object with a "skills" array of strings.

Resume:
${clipResume(resumeText, SKILL_EXTRACT_CAP)}

Return: {"skills": ["skill1", "skill2", ...]}`;

  const result = await callOpenAIJson<any>(
    "extractSkillsFromResume",
    {
      model: OPENAI_MODEL,
      max_completion_tokens: SKILL_MAX_TOKENS,
      temperature: GENERAL_TEMPERATURE,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    },
    null,
  );

  if (!result) return [];
  return asStringArray(result.skills);
}

interface FullResumeData {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  experienceSummary: string | null;
  educationSummary: string | null;
  pastRoles: string | null;
}

export async function extractFullResumeData(resumeText: string): Promise<FullResumeData> {
  const prompt = `You are an expert resume parser. Analyse this resume and extract structured information accurately.

RESUME TEXT:
${clipResume(resumeText, PARSE_RESUME_CAP)}

Return JSON. Use null for any field you cannot confidently determine:
{
  "fullName": "<candidate's full name, exactly as written>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "location": "<city, state/country or null>",
  "currentTitle": "<most recent job title or null>",
  "yearsOfExperience": <integer total years of professional experience, or null>,
  "skills": ["<technical and professional skills — list 10-25 if present>"],
  "experienceSummary": "<2-3 sentence professional overview including key roles and achievements>",
  "educationSummary": "<highest degree, field, institution and year if available, else null>",
  "pastRoles": "<semicolon-separated list of past job titles and companies, e.g. 'Software Engineer at Acme (2019-2021); Frontend Dev at Startup (2021-2023)'>"
}

Rules:
- fullName: ONLY the person's name (typically 2–5 words), taken from the header lines where the name appears. NEVER merge the name with a job title, certification, or acronym. Strip trailing certifications (e.g. "(PMP, CSM)").
- yearsOfExperience must be a number, not a string.
- If the resume has very little text (image-based PDF), extract what you can and return nulls for missing fields.`;

  const fallback: FullResumeData = {
    fullName: null,
    email: null,
    phone: null,
    location: null,
    currentTitle: null,
    yearsOfExperience: null,
    skills: [],
    experienceSummary: null,
    educationSummary: null,
    pastRoles: null,
  };

  const result = await callOpenAIJson<any>(
    "extractFullResumeData",
    {
      model: OPENAI_MODEL,
      max_completion_tokens: PARSE_MAX_TOKENS,
      // Temperature 0 + seed so repeated uploads of the same PDF yield the
      // same parsed metadata. Determinism here helps even though the real
      // anchor for screening stability is the file sha256 cache key.
      temperature: 0,
      seed: SCREEN_SEED,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    } as any,
    null,
  );

  if (!result) return fallback;

  const yoe = result.yearsOfExperience;
  return {
    fullName: typeof result.fullName === "string" ? result.fullName : null,
    email: typeof result.email === "string" ? result.email : null,
    phone: typeof result.phone === "string" ? result.phone : null,
    location: typeof result.location === "string" ? result.location : null,
    currentTitle: typeof result.currentTitle === "string" ? result.currentTitle : null,
    yearsOfExperience: yoe == null ? null : Number.isFinite(Number(yoe)) ? Math.round(Number(yoe)) : null,
    skills: asStringArray(result.skills),
    experienceSummary: typeof result.experienceSummary === "string" ? result.experienceSummary : null,
    educationSummary: typeof result.educationSummary === "string" ? result.educationSummary : null,
    pastRoles: typeof result.pastRoles === "string" ? result.pastRoles : null,
  };
}
