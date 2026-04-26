import { Router } from "express";
import { prisma, parseList, serializeList } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import {
  screenCandidate,
  screeningCacheKey,
  generateCandidateSummary,
  generateInterviewQuestions,
  generateJobDescription,
  improveJobDescription,
  type ScreeningOutput,
  type ScreeningMode,
} from "../lib/aiService.js";
import { candidatePublicSelect } from "../lib/prismaSafeSelects.js";
import {
  getCachedScreeningId,
  rememberScreening,
} from "../lib/screeningCache.js";

function parseScreeningMode(value: unknown): ScreeningMode {
  return value === "deep" ? "deep" : "standard";
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  }
  return false;
}

const router = Router();

/** Resolve the job to score the summary against: explicit jobId, then currentJobId, then latest application. */
async function resolveJobForSummary(candidateId: string, explicitJobId?: string | null) {
  if (explicitJobId) {
    const job = await prisma.job.findFirst({ where: { id: explicitJobId } });
    if (job) return { job, jobId: explicitJobId };
  }
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId },
    select: { currentJobId: true },
  });
  let jobId = candidate?.currentJobId ?? null;
  if (!jobId) {
    const app = await prisma.application.findFirst({
      where: { candidateId },
      orderBy: { appliedAt: "desc" },
      select: { jobId: true },
    });
    jobId = app?.jobId ?? null;
  }
  if (!jobId) return { job: null, jobId: null as string | null };
  const job = await prisma.job.findFirst({ where: { id: jobId } });
  return { job, jobId };
}

interface ScreeningRunOptions {
  mode?: ScreeningMode;
  // When true, bypass cache reads and call the LLM fresh. For file-backed
  // screening, an existing immutable durable cache row still wins at write time.
  force?: boolean;
}

const SCREENING_EXT_COL_RE = /(raw_response|cache_key|resume_file_sha|mode|Invalid column name)/i;
const SCREENING_CACHE_COL_RE =
  /(screening_cache|cache_key|resume_file_sha|match_score|fit_label|payload|Invalid column name|Invalid object name|does not exist)/i;

type ScreeningPayload = Pick<
  ScreeningOutput,
  | "matchScore"
  | "fitLabel"
  | "matchedSkills"
  | "missingSkills"
  | "strengths"
  | "risks"
  | "reasoning"
  | "aiRecommendation"
> & {
  rawResponse: string | null;
};

interface ScreeningRunDeps {
  db?: any;
  screenCandidate?: typeof screenCandidate;
}

function isScreeningCacheSchemaErr(err: any): boolean {
  const msg = String(err?.message ?? "");
  return err?.code === "P2021" || err?.code === "P2022" || SCREENING_CACHE_COL_RE.test(msg);
}

function payloadFromResult(result: ScreeningOutput): ScreeningPayload {
  return {
    matchScore: result.matchScore,
    fitLabel: result.fitLabel,
    matchedSkills: result.matchedSkills,
    missingSkills: result.missingSkills,
    strengths: result.strengths,
    risks: result.risks,
    reasoning: result.reasoning,
    aiRecommendation: result.aiRecommendation,
    rawResponse: result.rawResponse ?? null,
  };
}

function payloadFromScreeningRow(row: any): ScreeningPayload {
  return {
    matchScore: Number(row.matchScore) || 0,
    fitLabel: row.fitLabel,
    matchedSkills: parseList(row.matchedSkills),
    missingSkills: parseList(row.missingSkills),
    strengths: parseList(row.strengths),
    risks: parseList(row.risks),
    reasoning: row.reasoning ?? "",
    aiRecommendation: row.aiRecommendation ?? "",
    rawResponse: row.rawResponse ?? null,
  };
}

function payloadFromCacheRow(row: any): ScreeningPayload | null {
  if (!row) return null;
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  const matchScore = Number(row.matchScore ?? payload.matchScore);
  const fitLabel = typeof row.fitLabel === "string" ? row.fitLabel : payload.fitLabel;
  if (!Number.isFinite(matchScore) || typeof fitLabel !== "string") return null;
  return {
    matchScore,
    fitLabel: fitLabel as ScreeningPayload["fitLabel"],
    matchedSkills: parseList(payload.matchedSkills),
    missingSkills: parseList(payload.missingSkills),
    strengths: parseList(payload.strengths),
    risks: parseList(payload.risks),
    reasoning: typeof payload.reasoning === "string" ? payload.reasoning : "",
    aiRecommendation:
      typeof payload.aiRecommendation === "string" ? payload.aiRecommendation : "",
    rawResponse:
      typeof row.rawResponse === "string"
        ? row.rawResponse
        : typeof payload.rawResponse === "string"
          ? payload.rawResponse
          : null,
  };
}

function screeningRowData(
  candidateId: string,
  jobId: string,
  mode: ScreeningMode,
  resumeFileSha: string | null,
  cacheKey: string,
  payload: ScreeningPayload,
) {
  const baseData = {
    candidateId,
    jobId,
    matchScore: payload.matchScore,
    fitLabel: payload.fitLabel,
    matchedSkills: serializeList(payload.matchedSkills),
    missingSkills: serializeList(payload.missingSkills),
    strengths: serializeList(payload.strengths),
    risks: serializeList(payload.risks),
    reasoning: payload.reasoning,
    aiRecommendation: payload.aiRecommendation,
    hrDecision: "pending",
  };
  const fullData: Record<string, any> = {
    ...baseData,
    mode,
    resumeFileSha,
    cacheKey,
    rawResponse: payload.rawResponse ?? null,
  };
  return { baseData, fullData };
}

/** Insert with progressive column stripping when the DB predates extended columns. */
async function createAiScreeningRow(
  db: any,
  tag: string,
  baseData: Record<string, any>,
  fullData: Record<string, any>,
): Promise<any> {
  async function tryInsert(data: Record<string, any>) {
    return db.aiScreeningResult.create({ data: data as any });
  }

  const attempts: Array<{ label: string; data: Record<string, any> }> = [
    { label: "full", data: fullData },
    { label: "no raw_response", data: { ...fullData, rawResponse: undefined } },
    {
      label: "base only",
      data: {
        ...baseData,
        mode: undefined,
        resumeFileSha: undefined,
        cacheKey: undefined,
        rawResponse: undefined,
      },
    },
  ];

  let insertErr: any = null;
  for (const attempt of attempts) {
    try {
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(attempt.data)) {
        if (v !== undefined) data[k] = v;
      }
      const screening = await tryInsert(data);
      if (attempt.label !== "full") {
        console.warn(
          `${tag} aiScreeningResult.create succeeded with reduced shape (${attempt.label}). ` +
            "Run prisma db push on this server to add missing columns.",
        );
      }
      return screening;
    } catch (err: any) {
      insertErr = err;
      const msg = String(err?.message ?? "");
      const code = err?.code;
      const drift = code === "P2022" || SCREENING_EXT_COL_RE.test(msg);
      if (!drift) break;
    }
  }

  console.error(
    `${tag} aiScreeningResult.create failed after retries:`,
    (insertErr as Error)?.stack ?? insertErr,
  );
  throw new Error(
    `Failed to save screening result: ${(insertErr as Error)?.message ?? insertErr}`,
  );
}

async function createScreeningFromPayload(
  db: any,
  tag: string,
  candidateId: string,
  jobId: string,
  mode: ScreeningMode,
  resumeFileSha: string | null,
  cacheKey: string,
  payload: ScreeningPayload,
): Promise<any> {
  const { baseData, fullData } = screeningRowData(
    candidateId,
    jobId,
    mode,
    resumeFileSha,
    cacheKey,
    payload,
  );
  return createAiScreeningRow(db, tag, baseData, fullData);
}

async function findDurableScreeningCache(
  db: any,
  tag: string,
  cacheKey: string,
  resumeFileSha: string | null,
): Promise<ScreeningPayload | null> {
  if (!resumeFileSha || !db.screeningCache) return null;
  try {
    const cached = await db.screeningCache.findUnique({ where: { cacheKey } });
    if (!cached) return null;
    if (cached.resumeFileSha !== resumeFileSha) {
      console.warn(`${tag} durable cache sha mismatch for key=${cacheKey.slice(0, 12)}`);
      return null;
    }
    return payloadFromCacheRow(cached);
  } catch (err: any) {
    if (!isScreeningCacheSchemaErr(err)) {
      console.warn(`${tag} durable screening cache lookup failed:`, String(err?.message ?? err));
    }
    return null;
  }
}

async function rememberDurableScreeningCache(
  db: any,
  tag: string,
  cacheKey: string,
  jobId: string,
  resumeFileSha: string | null,
  mode: ScreeningMode,
  payload: ScreeningPayload,
): Promise<ScreeningPayload> {
  if (!resumeFileSha || !db.screeningCache) return payload;
  try {
    await db.screeningCache.create({
      data: {
        cacheKey,
        jobId,
        resumeFileSha,
        mode,
        matchScore: payload.matchScore,
        fitLabel: payload.fitLabel,
        payload: {
          matchScore: payload.matchScore,
          fitLabel: payload.fitLabel,
          matchedSkills: payload.matchedSkills,
          missingSkills: payload.missingSkills,
          strengths: payload.strengths,
          risks: payload.risks,
          reasoning: payload.reasoning,
          aiRecommendation: payload.aiRecommendation,
          rawResponse: payload.rawResponse ?? null,
        },
        rawResponse: payload.rawResponse ?? null,
      },
    });
    return payload;
  } catch (err: any) {
    if (err?.code === "P2002") {
      const existing = await findDurableScreeningCache(db, tag, cacheKey, resumeFileSha);
      if (existing) {
        console.log(
          `${tag} durable cache already existed; keeping score=${existing.matchScore}`,
        );
        return existing;
      }
    } else if (!isScreeningCacheSchemaErr(err)) {
      console.warn(`${tag} durable screening cache write failed:`, String(err?.message ?? err));
    }
    return payload;
  }
}

/**
 * Internal helper: run AI screening for a single candidate/job pair,
 * persist the result, and mark candidate as reviewing.
 */
export async function runScreeningInternal(
  candidateId: string,
  jobId: string,
  options: ScreeningRunOptions = {},
  deps: ScreeningRunDeps = {},
) {
  const db = deps.db ?? prisma;
  const runScreenCandidate = deps.screenCandidate ?? screenCandidate;
  const mode: ScreeningMode = options.mode === "deep" ? "deep" : "standard";
  const force = options.force === true;
  const tag = `[ai:screen ${candidateId.slice(0, 8)}/${jobId.slice(0, 8)} ${mode}${force ? " force" : ""}]`;
  console.log(`${tag} start`);

  let candidate: any;
  let job: any;
  try {
    [candidate, job] = await Promise.all([
      db.candidate.findFirst({
        where: { id: candidateId },
        select: candidatePublicSelect,
      }),
      db.job.findFirst({ where: { id: jobId } }),
    ]);
  } catch (err) {
    console.error(`${tag} candidate/job lookup failed:`, (err as Error)?.stack ?? err);
    throw new Error(`candidate/job lookup failed: ${(err as Error)?.message ?? err}`);
  }

  if (!candidate) {
    console.log(`${tag} candidate not found`);
    return { error: "candidate_not_found" as const };
  }
  if (!job) {
    console.log(`${tag} job not found`);
    return { error: "job_not_found" as const };
  }

  let resume: any = null;
  try {
    resume = await db.resume.findFirst({
      where: { candidateId },
      orderBy: { uploadedAt: "desc" },
    });
  } catch (err) {
    console.warn(`${tag} resume lookup failed (continuing without resume):`, (err as Error)?.message ?? err);
  }

  const resumeFileSha: string | null = typeof resume?.fileSha256 === "string" ? resume.fileSha256 : null;

  const screeningInput = {
    candidateName: candidate.fullName,
    resumeText: resume?.parsedText ?? candidate.experienceSummary ?? "",
    skills: parseList(candidate.skills),
    jobTitle: job.title,
    jobDescription: job.description,
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    requiredSkills: parseList(job.requiredSkills),
    preferredSkills: parseList(job.preferredSkills),
    seniority: job.seniority,
    minExperience: job.minExperience,
    maxExperience: job.maxExperience,
    linkedinProfile: null,
    linkedinDiscrepancies: [] as string[],
    linkedinStatus: null,
    resumeFileSha,
    mode,
  };

  // Determinism cache. Layers, in order:
  //   0. Current candidate DB row by cacheKey.
  //   0a. Durable screening_cache row keyed by the full file+job+mode prompt
  //       cacheKey; this survives candidate deletion and is the immutable source
  //       for same resume bytes + same job + same mode.
  //   0b. Legacy donor clone from ai_screening_results while rows still exist.
  //   1. Current candidate DB row by (jobId, resumeFileSha, mode, cacheKey).
  //   2. File cache: cacheKey -> aiScreeningResult.id.
  //   3. Legacy: previous result's rawResponse JSON embeds the old cacheKey.
  const inputsCacheKey = screeningCacheKey(screeningInput);

  if (force) {
    console.log(`${tag} force=true — skipping cache lookups`);
  } else {
    // Level 0 — DB cacheKey column (best when schema is up to date).
    try {
      const byKey = await db.aiScreeningResult.findFirst({
        where: { cacheKey: inputsCacheKey, candidateId, jobId },
        orderBy: { createdAt: "desc" },
      });
      if (byKey) {
        rememberScreening(inputsCacheKey, {
          screeningId: byKey.id,
          candidateId,
          jobId,
          matchScore: byKey.matchScore,
        });
        await db.candidate.update({
          where: { id: candidateId },
          data: { status: "reviewing" },
        });
        console.log(
          `[ai] cache HIT (db.cacheKey) cand=${candidateId} job=${jobId} mode=${mode} score=${byKey.matchScore}`,
        );
        return { screening: byKey, candidate, job, cached: true as const };
      }
    } catch (dbKeyErr: any) {
      // Swallow schema-drift errors silently — column may not exist yet.
      const msg = String(dbKeyErr?.message ?? "");
      if (!(dbKeyErr?.code === "P2022" || /cache_key|Invalid column name/i.test(msg))) {
        console.warn("[ai] cacheKey lookup failed:", msg);
      }
    }

    // Level 0a — Durable cache row independent from candidate lifecycle.
    const durablePayload = await findDurableScreeningCache(
      db,
      tag,
      inputsCacheKey,
      resumeFileSha,
    );
    if (durablePayload) {
      const screening = await createScreeningFromPayload(
        db,
        tag,
        candidateId,
        jobId,
        mode,
        resumeFileSha,
        inputsCacheKey,
        durablePayload,
      );
      try {
        rememberScreening(inputsCacheKey, {
          screeningId: screening.id,
          candidateId,
          jobId,
          matchScore: screening.matchScore,
        });
      } catch (cacheWriteErr) {
        console.warn(`${tag} failed to write screening cache (non-fatal):`, (cacheWriteErr as Error)?.message);
      }
      await db.candidate.update({
        where: { id: candidateId },
        data: { status: "reviewing" },
      });
      console.log(
        `${tag} cache HIT (durable screening_cache) score=${screening.matchScore}`,
      );
      return { screening, candidate, job, cached: true as const };
    }

    // Level 0b — Same job + identical inputs were already scored for a *different*
    // candidate row (e.g. repeat upload of the same file without email match
    // creates a new candidate each time). Clone scores so the AI rating does not
    // change for the same résumé bytes + job spec.
    try {
      const donor = await db.aiScreeningResult.findFirst({
        where: {
          jobId,
          cacheKey: inputsCacheKey,
          candidateId: { not: candidateId },
        },
        orderBy: { createdAt: "desc" },
      });
      if (donor) {
        const donorPayload = await rememberDurableScreeningCache(
          db,
          tag,
          inputsCacheKey,
          jobId,
          resumeFileSha,
          mode,
          payloadFromScreeningRow(donor),
        );
        const screening = await createScreeningFromPayload(
          db,
          tag,
          candidateId,
          jobId,
          mode,
          resumeFileSha,
          inputsCacheKey,
          donorPayload,
        );
        try {
          rememberScreening(inputsCacheKey, {
            screeningId: screening.id,
            candidateId,
            jobId,
            matchScore: screening.matchScore,
          });
        } catch (cacheWriteErr) {
          console.warn(`${tag} failed to write screening cache (non-fatal):`, (cacheWriteErr as Error)?.message);
        }
        await db.candidate.update({
          where: { id: candidateId },
          data: { status: "reviewing" },
        });
        console.log(
          `${tag} cache HIT (global clone from donor=${donor.candidateId.slice(0, 8)}) ` +
            `score=${screening.matchScore}`,
        );
        return { screening, candidate, job, cached: true as const };
      }
    } catch (globalErr: any) {
      const msg = String(globalErr?.message ?? "");
      if (!(globalErr?.code === "P2022" || /cache_key|Invalid column name/i.test(msg))) {
        console.warn("[ai] global cacheKey donor lookup failed:", msg);
      }
    }

    // Level 1 — DB lookup by (jobId, resumeFileSha, mode, cacheKey).
    if (resumeFileSha) {
      try {
        const bySha = await db.aiScreeningResult.findFirst({
          where: {
            jobId,
            resumeFileSha,
            mode,
            candidateId,
            cacheKey: inputsCacheKey,
          },
          orderBy: { createdAt: "desc" },
        });
        if (bySha) {
          await rememberDurableScreeningCache(
            db,
            tag,
            inputsCacheKey,
            jobId,
            resumeFileSha,
            mode,
            payloadFromScreeningRow(bySha),
          );
          rememberScreening(inputsCacheKey, {
            screeningId: bySha.id,
            candidateId,
            jobId,
            matchScore: bySha.matchScore,
          });
          await db.candidate.update({
            where: { id: candidateId },
            data: { status: "reviewing" },
          });
          console.log(
            `[ai] cache HIT (db.sha) cand=${candidateId} job=${jobId} mode=${mode} score=${bySha.matchScore}`,
          );
          return { screening: bySha, candidate, job, cached: true as const };
        }
      } catch (shaErr: any) {
        const msg = String(shaErr?.message ?? "");
        if (
          !(shaErr?.code === "P2022" ||
            /resume_file_sha|mode|Invalid column name/i.test(msg))
        ) {
          console.warn("[ai] sha lookup failed:", msg);
        }
      }
    }

    // Level 2 — on-disk file cache keyed by inputsCacheKey.
    const fileEntry = getCachedScreeningId(inputsCacheKey);
    if (fileEntry?.screeningId) {
      try {
        const cachedRow = await db.aiScreeningResult.findFirst({
          where: { id: fileEntry.screeningId, candidateId, jobId },
        });
        if (cachedRow) {
          await db.candidate.update({
            where: { id: candidateId },
            data: { status: "reviewing" },
          });
          console.log(
            `[ai] cache HIT (file) cand=${candidateId} job=${jobId} mode=${mode} score=${cachedRow.matchScore}`,
          );
          return { screening: cachedRow, candidate, job, cached: true as const };
        }
      } catch (lookupErr) {
        console.warn(
          "[ai] file cache row lookup failed; proceeding fresh:",
          (lookupErr as Error)?.message ?? lookupErr,
        );
      }
    }

    // Level 3 — legacy DB cache via rawResponse, if the column exists.
    try {
      const previous = await db.aiScreeningResult.findFirst({
        where: { candidateId, jobId },
        orderBy: { createdAt: "desc" },
      });
      if (previous?.rawResponse) {
        try {
          const parsed = JSON.parse(previous.rawResponse);
          if (parsed?.cacheKey && parsed.cacheKey === inputsCacheKey) {
            await rememberDurableScreeningCache(
              db,
              tag,
              inputsCacheKey,
              jobId,
              resumeFileSha,
              mode,
              payloadFromScreeningRow(previous),
            );
            rememberScreening(inputsCacheKey, {
              screeningId: previous.id,
              candidateId,
              jobId,
              matchScore: previous.matchScore,
            });
            await db.candidate.update({
              where: { id: candidateId },
              data: { status: "reviewing" },
            });
            console.log(
              `[ai] cache HIT (db.legacy) cand=${candidateId} job=${jobId} mode=${mode} score=${previous.matchScore}`,
            );
            return { screening: previous, candidate, job, cached: true as const };
          }
        } catch {
          /* fall through */
        }
      }
    } catch (dbCacheErr) {
      console.warn(
        "[ai] legacy db cache lookup failed; proceeding fresh:",
        (dbCacheErr as Error)?.message ?? dbCacheErr,
      );
    }
  }

  console.log(
    `${tag} cache MISS — calling LLM ` +
      `(resumeChars=${screeningInput.resumeText.length} reqSkills=${screeningInput.requiredSkills.length})`,
  );
  let result: Awaited<ReturnType<typeof screenCandidate>>;
  try {
    result = await runScreenCandidate(screeningInput);
  } catch (err) {
    console.error(`${tag} screenCandidate threw:`, (err as Error)?.stack ?? err);
    throw new Error(`AI screening call failed: ${(err as Error)?.message ?? err}`);
  }
  console.log(
    `${tag} LLM done score=${result.matchScore} fit=${result.fitLabel} ` +
      `confidence=${result.confidence} jobSpec=${result.jobSpecQuality}`,
  );

  const payload = await rememberDurableScreeningCache(
    db,
    tag,
    inputsCacheKey,
    jobId,
    resumeFileSha,
    mode,
    payloadFromResult(result),
  );
  if (payload.matchScore !== result.matchScore) {
    console.log(
      `${tag} durable cache retained score=${payload.matchScore} after fresh LLM score=${result.matchScore}`,
    );
  }

  const screening = await createScreeningFromPayload(
    db,
    tag,
    candidateId,
    jobId,
    mode,
    resumeFileSha,
    inputsCacheKey,
    payload,
  );
  console.log(`${tag} persisted screeningId=${screening.id}`);

  try {
    rememberScreening(inputsCacheKey, {
      screeningId: screening.id,
      candidateId,
      jobId,
      matchScore: screening.matchScore,
    });
  } catch (cacheWriteErr) {
    console.warn(
      `${tag} failed to write screening cache (non-fatal):`,
      (cacheWriteErr as Error)?.message ?? cacheWriteErr,
    );
  }

  try {
    await db.candidate.update({
      where: { id: candidateId },
      data: { status: "reviewing" },
    });
  } catch (statusErr) {
    console.warn(
      `${tag} candidate status update failed (non-fatal):`,
      (statusErr as Error)?.message ?? statusErr,
    );
  }

  return { screening, candidate, job };
}

/**
 * POST /ai/screen
 * Body: { candidateId, jobId }
 * Runs AI screening and persists to ai_screening_results.
 */
router.post("/screen", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId, mode, force } = req.body ?? {};
    if (!candidateId || typeof candidateId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    }
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "jobId is required" });
    }

    const out = await runScreeningInternal(candidateId, jobId, {
      mode: parseScreeningMode(mode),
      force: parseBooleanFlag(force),
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }

    return res.json({
      ...out.screening,
      matchedSkills: parseList(out.screening.matchedSkills),
      missingSkills: parseList(out.screening.missingSkills),
      strengths: parseList(out.screening.strengths),
      risks: parseList(out.screening.risks),
    });
  } catch (err) {
    console.error("[ai] /screen failed:", (err as Error)?.stack ?? err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: (err as Error)?.message ?? "AI screening failed",
    });
  }
});

/**
 * Legacy path-param variant kept for backwards compatibility.
 */
router.post("/screen/:candidateId/:jobId", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId } = req.params as Record<string, string>;
    if (!candidateId) return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    if (!jobId) return res.status(400).json({ error: "Bad Request", message: "jobId is required" });

    const out = await runScreeningInternal(candidateId, jobId, {
      mode: parseScreeningMode(req.body?.mode ?? req.query?.mode),
      force: parseBooleanFlag(req.body?.force ?? req.query?.force),
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }

    return res.json({
      ...out.screening,
      matchedSkills: parseList(out.screening.matchedSkills),
      missingSkills: parseList(out.screening.missingSkills),
      strengths: parseList(out.screening.strengths),
      risks: parseList(out.screening.risks),
    });
  } catch (err) {
    console.error("[ai] /screen (path-param) failed:", (err as Error)?.stack ?? err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: (err as Error)?.message ?? "AI screening failed",
    });
  }
});

/**
 * GET /ai/rank/:jobId
 * Returns candidates for the job sorted by matchScore desc.
 * Triggers screening for any unscreened candidate (best-effort, per-candidate error isolation).
 */
router.get("/rank/:jobId", requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params as Record<string, string>;
    if (!jobId) {
      return res.status(400).json({ error: "Bad Request", message: "jobId is required" });
    }

    const mode = parseScreeningMode(req.query?.mode);
    const force = parseBooleanFlag(req.query?.force);

    const job = await prisma.job.findFirst({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: "Not Found", message: "Job not found" });

    // Candidates associated with this job (via currentJobId). Trigger
    // screening for any unscreened (or, when force=true, every) candidate.
    const jobCandidates = await prisma.candidate.findMany({
      where: { currentJobId: jobId },
      select: { id: true },
    });

    if (jobCandidates.length > 0) {
      let toScreen: Array<{ id: string }>;
      if (force) {
        // Deep scan / force-rerun path — re-run every candidate on this job.
        toScreen = jobCandidates;
      } else {
        const existing = await prisma.aiScreeningResult.findMany({
          where: {
            jobId,
            candidateId: { in: jobCandidates.map((c) => c.id) },
          },
        });
        const screenedIds = new Set(existing.map((s) => s.candidateId));
        toScreen = jobCandidates.filter((c) => !screenedIds.has(c.id));
      }

      // Best-effort screening with bounded concurrency (max 3 parallel) to avoid
      // overwhelming the AI service. Failures are isolated per-candidate.
      const CONCURRENCY = 3;
      for (let i = 0; i < toScreen.length; i += CONCURRENCY) {
        const batch = toScreen.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (c) => {
            try {
              await runScreeningInternal(c.id, jobId, { mode, force });
            } catch (e) {
              console.error(`Auto-screen failed for candidate ${c.id}:`, e);
            }
          }),
        );
      }
    }

    // Fetch all screening results for this job, newest first, so we can pick latest per candidate.
    const screenings = await prisma.aiScreeningResult.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
    });

    // Keep only latest screening per candidate (createdAt desc ensures first is latest).
    const latestMap = new Map<string, (typeof screenings)[number]>();
    for (const s of screenings) {
      if (!latestMap.has(s.candidateId)) latestMap.set(s.candidateId, s);
    }

    const candidateIds = Array.from(latestMap.keys());
    const candidateList =
      candidateIds.length > 0
        ? await prisma.candidate.findMany({
            where: { id: { in: candidateIds } },
            select: candidatePublicSelect,
          })
        : [];
    const candidateMap = new Map(candidateList.map((c) => [c.id, c]));

    const rankings = candidateIds
      .map((cid) => {
        const s = latestMap.get(cid)!;
        const c = candidateMap.get(cid);
        const matched = parseList(s.matchedSkills);
        const missing = parseList(s.missingSkills);
        return {
          candidateId: cid,
          candidateName: c?.fullName ?? "Unknown",
          fullName: c?.fullName ?? "Unknown",
          email: c?.email ?? null,
          score: s.matchScore,
          fitLabel: s.fitLabel,
          matchedSkillsCount: matched.length,
          missingSkillsCount: missing.length,
          reasoning: s.reasoning ?? "",
          status: c?.status ?? "unknown",
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ rank: i + 1, ...r }));

    return res.json({ jobId, jobTitle: job.title, rankings });
  } catch (err) {
    console.error("Ranking error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Ranking failed" });
  }
});

/**
 * POST /ai/summary
 * Body: { candidateId }
 * Runs generateCandidateSummary and caches to ai_candidate_summaries (upsert by delete+insert).
 */
router.post("/summary", requireAuth, async (req, res) => {
  try {
    const { candidateId } = req.body ?? {};
    if (!candidateId || typeof candidateId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId },
      select: candidatePublicSelect,
    });
    if (!candidate) return res.status(404).json({ error: "Not Found", message: "Candidate not found" });

    const requestedJobId = (req.body?.jobId as string | undefined) || undefined;
    const { job, jobId } = await resolveJobForSummary(candidateId, requestedJobId || candidate.currentJobId);

    const [resume, latestScreening] = await Promise.all([
      prisma.resume.findFirst({ where: { candidateId } }),
      jobId
        ? prisma.aiScreeningResult.findFirst({
            where: { candidateId, jobId },
            orderBy: { createdAt: "desc" },
          })
        : prisma.aiScreeningResult.findFirst({
            where: { candidateId },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    const summary = await generateCandidateSummary({
      candidateName: candidate.fullName,
      resumeText: resume?.parsedText ?? candidate.experienceSummary ?? "",
      skills: parseList(candidate.skills),
      experienceSummary: candidate.experienceSummary,
      jobTitle: job?.title ?? null,
      jobDescription: job?.description ?? null,
      jobResponsibilities: job?.responsibilities ?? null,
      jobQualifications: job?.qualifications ?? null,
      jobDepartment: job?.department ?? null,
      jobSeniority: job?.seniority ?? null,
      requiredSkills: job ? parseList(job.requiredSkills) : [],
      preferredSkills: job ? parseList(job.preferredSkills) : [],
      screeningScore: latestScreening?.matchScore ?? null,
      fitLabel: latestScreening?.fitLabel ?? null,
      matchedSkills: latestScreening ? parseList(latestScreening.matchedSkills) : [],
      missingSkills: latestScreening ? parseList(latestScreening.missingSkills) : [],
      screeningReasoning: latestScreening?.reasoning ?? null,
    });

    await prisma.aiCandidateSummary.deleteMany({ where: { candidateId } });

    const saved = await prisma.aiCandidateSummary.create({
      data: {
        candidateId,
        overallSummary: summary.overallSummary,
        experienceSnapshot: summary.experienceSnapshot,
        strengths: serializeList(summary.strengths),
        risks: serializeList(summary.risks),
        likelyFitAreas: serializeList(summary.likelyFitAreas),
        missingCapabilities: serializeList(summary.missingCapabilities),
        recommendationNotes: summary.recommendationNotes,
      },
    });

    // Return hydrated arrays (not raw JSON strings) so the client never receives serialized list fields.
    return res.json({
      ...saved,
      candidateId,
      strengths: summary.strengths,
      risks: summary.risks,
      likelyFitAreas: summary.likelyFitAreas,
      missingCapabilities: summary.missingCapabilities,
    });
  } catch (err) {
    console.error("Summary error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Summary generation failed" });
  }
});

/**
 * Legacy path-param variant.
 */
router.post("/summary/:candidateId", requireAuth, async (req, res) => {
  try {
    const { candidateId } = req.params as Record<string, string>;
    if (!candidateId) {
      return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId },
      select: candidatePublicSelect,
    });
    if (!candidate) return res.status(404).json({ error: "Not Found", message: "Candidate not found" });

    const requestedJobId = (req.body?.jobId as string | undefined) || undefined;
    const { job, jobId } = await resolveJobForSummary(candidateId, requestedJobId || candidate.currentJobId);

    const [resume, latestScreening] = await Promise.all([
      prisma.resume.findFirst({ where: { candidateId } }),
      jobId
        ? prisma.aiScreeningResult.findFirst({
            where: { candidateId, jobId },
            orderBy: { createdAt: "desc" },
          })
        : prisma.aiScreeningResult.findFirst({
            where: { candidateId },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    const summary = await generateCandidateSummary({
      candidateName: candidate.fullName,
      resumeText: resume?.parsedText ?? candidate.experienceSummary ?? "",
      skills: parseList(candidate.skills),
      experienceSummary: candidate.experienceSummary,
      jobTitle: job?.title ?? null,
      jobDescription: job?.description ?? null,
      jobResponsibilities: job?.responsibilities ?? null,
      jobQualifications: job?.qualifications ?? null,
      jobDepartment: job?.department ?? null,
      jobSeniority: job?.seniority ?? null,
      requiredSkills: job ? parseList(job.requiredSkills) : [],
      preferredSkills: job ? parseList(job.preferredSkills) : [],
      screeningScore: latestScreening?.matchScore ?? null,
      fitLabel: latestScreening?.fitLabel ?? null,
      matchedSkills: latestScreening ? parseList(latestScreening.matchedSkills) : [],
      missingSkills: latestScreening ? parseList(latestScreening.missingSkills) : [],
      screeningReasoning: latestScreening?.reasoning ?? null,
    });

    await prisma.aiCandidateSummary.deleteMany({ where: { candidateId } });

    const saved = await prisma.aiCandidateSummary.create({
      data: {
        candidateId,
        overallSummary: summary.overallSummary,
        experienceSnapshot: summary.experienceSnapshot,
        strengths: serializeList(summary.strengths),
        risks: serializeList(summary.risks),
        likelyFitAreas: serializeList(summary.likelyFitAreas),
        missingCapabilities: serializeList(summary.missingCapabilities),
        recommendationNotes: summary.recommendationNotes,
      },
    });

    return res.json({
      ...saved,
      candidateId,
      strengths: summary.strengths,
      risks: summary.risks,
      likelyFitAreas: summary.likelyFitAreas,
      missingCapabilities: summary.missingCapabilities,
    });
  } catch (err) {
    console.error("Summary error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Summary generation failed" });
  }
});

interface StoredQuestions {
  technical: string[];
  behavioral: string[];
  roleSpecific: string[];
  followUp: string[];
}

function hydrateStoredQuestions(row: any): StoredQuestions {
  return {
    technical: parseList(row.technical),
    behavioral: parseList(row.behavioral),
    roleSpecific: parseList(row.roleSpecific),
    followUp: parseList(row.followUp),
  };
}

/**
 * Resolve interview questions for a candidate/job pair. If a cached set for
 * the given mode exists in the DB we return it; otherwise we generate, persist,
 * and return. Pass force=true to regenerate and overwrite the cached row.
 */
async function resolveInterviewQuestions(
  candidateId: string,
  jobId: string,
  opts: {
    mode?: ScreeningMode;
    force?: boolean;
    focus?: string;
    types?: ("technical" | "behavioral" | "roleSpecific" | "followUp")[];
  } = {},
) {
  const mode: ScreeningMode = opts.mode === "deep" ? "deep" : "standard";
  const force = opts.force === true;
  const tag = `[ai:iq ${candidateId.slice(0, 8)}/${jobId.slice(0, 8)} ${mode}${force ? " force" : ""}]`;

  const [candidate, job] = await Promise.all([
    prisma.candidate.findFirst({
      where: { id: candidateId },
      select: candidatePublicSelect,
    }),
    prisma.job.findFirst({ where: { id: jobId } }),
  ]);

  if (!candidate) return { error: "candidate_not_found" as const };
  if (!job) return { error: "job_not_found" as const };

  if (!force) {
    try {
      const cached = await prisma.aiInterviewQuestionSet.findFirst({
        where: { candidateId, jobId, mode },
        orderBy: { createdAt: "desc" },
      });
      if (cached) {
        console.log(`${tag} cache HIT id=${cached.id}`);
        return {
          cached: true as const,
          id: cached.id,
          candidateId,
          jobId,
          mode,
          questions: hydrateStoredQuestions(cached),
          updatedAt: cached.updatedAt,
        };
      }
    } catch (err: any) {
      // Schema drift: table not yet created on this DB.
      const msg = String(err?.message ?? "");
      if (
        !(err?.code === "P2021" ||
          err?.code === "P2022" ||
          /ai_interview_question_sets|Invalid object name|Invalid column name/i.test(msg))
      ) {
        console.warn(`${tag} cache lookup failed:`, msg);
      } else {
        console.warn(
          `${tag} interview question cache table missing; regenerating each call. Run prisma db push.`,
        );
      }
    }
  }

  const [resume, latestScreening] = await Promise.all([
    prisma.resume.findFirst({
      where: { candidateId },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.aiScreeningResult.findFirst({
      where: { candidateId, jobId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  console.log(`${tag} generating via LLM`);
  const generated = await generateInterviewQuestions({
    candidateName: candidate.fullName,
    resumeText: resume?.parsedText ?? candidate.experienceSummary ?? "",
    skills: parseList(candidate.skills),
    missingSkills: latestScreening ? parseList(latestScreening.missingSkills) : [],
    jobTitle: job.title,
    seniority: job.seniority,
    jobDescription: job.description,
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    requiredSkills: parseList(job.requiredSkills),
    preferredSkills: parseList(job.preferredSkills),
    department: job.department,
    focus: opts.focus,
    types: opts.types,
  });

  const resumeFileSha: string | null =
    typeof (resume as any)?.fileSha256 === "string" ? (resume as any).fileSha256 : null;

  const upsertData = {
    candidateId,
    jobId,
    mode,
    resumeFileSha,
    technical: serializeList(generated.technical),
    behavioral: serializeList(generated.behavioral),
    roleSpecific: serializeList(generated.roleSpecific),
    followUp: serializeList(generated.followUp),
  };

  let saved: any = null;
  try {
    saved = await prisma.aiInterviewQuestionSet.upsert({
      where: { candidateId_jobId_mode: { candidateId, jobId, mode } },
      create: upsertData,
      update: upsertData,
    });
    console.log(`${tag} persisted id=${saved.id}`);
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    console.warn(
      `${tag} interview question persist failed; returning generated set without caching:`,
      msg,
    );
  }

  return {
    cached: false as const,
    id: saved?.id ?? null,
    candidateId,
    jobId,
    mode,
    questions: generated,
    updatedAt: saved?.updatedAt ?? new Date(),
  };
}

const ALLOWED_QUESTION_TYPES = [
  "technical",
  "behavioral",
  "roleSpecific",
  "followUp",
] as const;
type AllowedQuestionType = (typeof ALLOWED_QUESTION_TYPES)[number];

function parseInterviewQuestionsBody(body: any): {
  focus?: string;
  types?: AllowedQuestionType[];
  error?: string;
} {
  const out: { focus?: string; types?: AllowedQuestionType[] } = {};
  if (body == null || typeof body !== "object") return out;

  if ("focus" in body && body.focus != null) {
    if (typeof body.focus !== "string") return { error: "focus must be a string" };
    const trimmed = body.focus.trim();
    if (trimmed.length > 500) return { error: "focus must be 500 chars or fewer" };
    if (trimmed.length > 0) out.focus = trimmed;
  }

  if ("types" in body && body.types != null) {
    if (!Array.isArray(body.types)) return { error: "types must be an array" };
    if (body.types.length === 0) return { error: "types must include at least one value" };
    const filtered: AllowedQuestionType[] = [];
    for (const t of body.types) {
      if (typeof t !== "string" || !(ALLOWED_QUESTION_TYPES as readonly string[]).includes(t)) {
        return { error: `unknown question type: ${String(t)}` };
      }
      if (!filtered.includes(t as AllowedQuestionType)) filtered.push(t as AllowedQuestionType);
    }
    out.types = filtered;
  }

  return out;
}

/**
 * POST /ai/interview-questions
 * Body: { candidateId, jobId, mode?, force?, focus?, types? }
 * Returns cached questions when available; only calls the LLM on first generation or force.
 */
router.post("/interview-questions", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId, mode, force } = req.body ?? {};
    if (!candidateId || typeof candidateId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    }
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "jobId is required" });
    }

    const parsed = parseInterviewQuestionsBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: "Bad Request", message: parsed.error });
    }

    const out = await resolveInterviewQuestions(candidateId, jobId, {
      mode: parseScreeningMode(mode),
      force: parseBooleanFlag(force),
      focus: parsed.focus,
      types: parsed.types,
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }
    return res.json(out);
  } catch (err) {
    console.error("Interview questions error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Interview question generation failed" });
  }
});

/**
 * Legacy path-param variant.
 */
router.post("/interview-questions/:candidateId/:jobId", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId } = req.params as Record<string, string>;
    if (!candidateId) return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    if (!jobId) return res.status(400).json({ error: "Bad Request", message: "jobId is required" });

    const parsed = parseInterviewQuestionsBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: "Bad Request", message: parsed.error });
    }

    const out = await resolveInterviewQuestions(candidateId, jobId, {
      mode: parseScreeningMode(req.body?.mode ?? req.query?.mode),
      force: parseBooleanFlag(req.body?.force ?? req.query?.force),
      focus: parsed.focus,
      types: parsed.types,
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }
    return res.json(out);
  } catch (err) {
    console.error("Interview questions error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Interview question generation failed" });
  }
});

/**
 * GET /ai/interview-questions/:candidateId/:jobId
 * Lightweight fetch-only — returns null.questions if none exist yet. Doesn't
 * call the LLM.
 */
router.get("/interview-questions/:candidateId/:jobId", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId } = req.params as Record<string, string>;
    if (!candidateId) return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    if (!jobId) return res.status(400).json({ error: "Bad Request", message: "jobId is required" });

    const mode = parseScreeningMode(req.query?.mode);
    try {
      const cached = await prisma.aiInterviewQuestionSet.findFirst({
        where: { candidateId, jobId, mode },
        orderBy: { createdAt: "desc" },
      });
      if (!cached) {
        return res.status(404).json({ error: "Not Found", message: "No cached interview questions" });
      }
      return res.json({
        cached: true,
        id: cached.id,
        candidateId,
        jobId,
        mode: cached.mode,
        questions: hydrateStoredQuestions(cached),
        updatedAt: cached.updatedAt,
      });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (
        err?.code === "P2021" ||
        err?.code === "P2022" ||
        /ai_interview_question_sets|Invalid object name|Invalid column name/i.test(msg)
      ) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Interview question cache not yet provisioned" });
      }
      throw err;
    }
  } catch (err) {
    console.error("Interview questions fetch error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch interview questions" });
  }
});

/**
 * POST /ai/generate-jd
 * Body: { prompt, department?, seniority?, employmentType? }
 */
router.post("/generate-jd", requireAuth, async (req, res) => {
  try {
    const { prompt, department, seniority, employmentType } = req.body ?? {};
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Bad Request", message: "prompt is required" });
    }

    const result = await generateJobDescription({ prompt, department, seniority, employmentType });
    return res.json(result);
  } catch (err) {
    console.error("JD generation error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "JD generation failed" });
  }
});

/**
 * POST /ai/improve-jd
 * Body: { existingJD, focusAreas? }
 */
router.post("/improve-jd", requireAuth, async (req, res) => {
  try {
    const { existingJD, focusAreas } = req.body ?? {};
    if (!existingJD || typeof existingJD !== "string" || existingJD.trim().length === 0) {
      return res.status(400).json({ error: "Bad Request", message: "existingJD is required" });
    }

    const result = await improveJobDescription({ existingJD, focusAreas });
    return res.json(result);
  } catch (err) {
    console.error("JD improve error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "JD improvement failed" });
  }
});

/**
 * GET /ai/screening-results/:candidateId/:jobId
 * Fetch the most recent screening result for a candidate/job pair.
 */
router.get("/screening-results/:candidateId/:jobId", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId } = req.params as Record<string, string>;
    if (!candidateId) return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    if (!jobId) return res.status(400).json({ error: "Bad Request", message: "jobId is required" });

    const screening = await prisma.aiScreeningResult.findFirst({
      where: { candidateId, jobId },
      orderBy: { createdAt: "desc" },
    });

    if (!screening) return res.status(404).json({ error: "Not Found", message: "No screening result found" });
    return res.json(screening);
  } catch (err) {
    console.error("Fetch screening error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch screening result" });
  }
});

export default router;
