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
  // When true, bypass all caches and call the LLM fresh. Use sparingly —
  // deterministic cache hits are the whole point of this pipeline.
  force?: boolean;
}

/**
 * Internal helper: run AI screening for a single candidate/job pair,
 * persist the result, and mark candidate as reviewing.
 */
async function runAndPersistScreening(
  candidateId: string,
  jobId: string,
  options: ScreeningRunOptions = {},
) {
  const mode: ScreeningMode = options.mode === "deep" ? "deep" : "standard";
  const force = options.force === true;
  const tag = `[ai:screen ${candidateId.slice(0, 8)}/${jobId.slice(0, 8)} ${mode}${force ? " force" : ""}]`;
  console.log(`${tag} start`);

  let candidate: any;
  let job: any;
  try {
    [candidate, job] = await Promise.all([
      prisma.candidate.findFirst({
        where: { id: candidateId },
        select: candidatePublicSelect,
      }),
      prisma.job.findFirst({ where: { id: jobId } }),
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
    resume = await prisma.resume.findFirst({
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
  //   0. DB lookup by cacheKey column — cheapest hit, works across restarts
  //      and machines, and is stable regardless of which candidate row holds
  //      the resume (same file bytes = same key).
  //   1. DB lookup by (jobId, resumeFileSha, mode) — secondary match on the
  //      new determinism fields.
  //   2. File cache: cacheKey -> aiScreeningResult.id.
  //   3. Legacy: previous result's rawResponse JSON embeds the old cacheKey.
  const inputsCacheKey = screeningCacheKey(screeningInput);

  if (force) {
    console.log(`${tag} force=true — skipping cache lookups`);
  } else {
    // Level 0 — DB cacheKey column (best when schema is up to date).
    try {
      const byKey = await prisma.aiScreeningResult.findFirst({
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
        await prisma.candidate.update({
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

    // Level 1 — DB lookup by (jobId, resumeFileSha, mode).
    if (resumeFileSha) {
      try {
        const bySha = await prisma.aiScreeningResult.findFirst({
          where: {
            jobId,
            resumeFileSha,
            mode,
            candidateId,
          },
          orderBy: { createdAt: "desc" },
        });
        if (bySha) {
          rememberScreening(inputsCacheKey, {
            screeningId: bySha.id,
            candidateId,
            jobId,
            matchScore: bySha.matchScore,
          });
          await prisma.candidate.update({
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
        const cachedRow = await prisma.aiScreeningResult.findFirst({
          where: { id: fileEntry.screeningId, candidateId, jobId },
        });
        if (cachedRow) {
          await prisma.candidate.update({
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
      const previous = await prisma.aiScreeningResult.findFirst({
        where: { candidateId, jobId },
        orderBy: { createdAt: "desc" },
      });
      if (previous?.rawResponse) {
        try {
          const parsed = JSON.parse(previous.rawResponse);
          if (parsed?.cacheKey && parsed.cacheKey === inputsCacheKey) {
            rememberScreening(inputsCacheKey, {
              screeningId: previous.id,
              candidateId,
              jobId,
              matchScore: previous.matchScore,
            });
            await prisma.candidate.update({
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
    result = await screenCandidate(screeningInput);
  } catch (err) {
    console.error(`${tag} screenCandidate threw:`, (err as Error)?.stack ?? err);
    throw new Error(`AI screening call failed: ${(err as Error)?.message ?? err}`);
  }
  console.log(
    `${tag} LLM done score=${result.matchScore} fit=${result.fitLabel} ` +
      `confidence=${result.confidence} jobSpec=${result.jobSpecQuality}`,
  );

  const baseData = {
    candidateId,
    jobId,
    matchScore: result.matchScore,
    fitLabel: result.fitLabel,
    matchedSkills: serializeList(result.matchedSkills),
    missingSkills: serializeList(result.missingSkills),
    strengths: serializeList(result.strengths),
    risks: serializeList(result.risks),
    reasoning: result.reasoning,
    aiRecommendation: result.aiRecommendation,
    hrDecision: "pending",
  };

  // Extended fields (mode, resumeFileSha, cacheKey, rawResponse) are tolerant
  // of schema drift — older DBs may not have the columns yet. We try the full
  // shape first and progressively strip columns if the insert fails with the
  // well-known "Invalid column name" error (Prisma code P2022).
  const fullData: Record<string, any> = {
    ...baseData,
    mode,
    resumeFileSha,
    cacheKey: inputsCacheKey,
    rawResponse: result.rawResponse ?? null,
  };
  const EXTENDED_COLUMN_RE = /(raw_response|cache_key|resume_file_sha|mode|Invalid column name)/i;

  async function tryInsert(data: Record<string, any>) {
    return prisma.aiScreeningResult.create({ data: data as any });
  }

  let screening: any;
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
      screening = await tryInsert(data);
      if (attempt.label !== "full") {
        console.warn(
          `${tag} aiScreeningResult.create succeeded with reduced shape (${attempt.label}). ` +
            "Run prisma db push on this server to add missing columns.",
        );
      }
      insertErr = null;
      break;
    } catch (err: any) {
      insertErr = err;
      const msg = String(err?.message ?? "");
      const code = err?.code;
      const drift = code === "P2022" || EXTENDED_COLUMN_RE.test(msg);
      if (!drift) break;
    }
  }

  if (!screening) {
    console.error(
      `${tag} aiScreeningResult.create failed after retries:`,
      (insertErr as Error)?.stack ?? insertErr,
    );
    throw new Error(
      `Failed to save screening result: ${(insertErr as Error)?.message ?? insertErr}`,
    );
  }
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
    await prisma.candidate.update({
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

    const out = await runAndPersistScreening(candidateId, jobId, {
      mode: parseScreeningMode(mode),
      force: parseBooleanFlag(force),
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }

    res.json({
      ...out.screening,
      matchedSkills: parseList(out.screening.matchedSkills),
      missingSkills: parseList(out.screening.missingSkills),
      strengths: parseList(out.screening.strengths),
      risks: parseList(out.screening.risks),
    });
  } catch (err) {
    console.error("[ai] /screen failed:", (err as Error)?.stack ?? err);
    res.status(500).json({
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

    const out = await runAndPersistScreening(candidateId, jobId, {
      mode: parseScreeningMode(req.body?.mode ?? req.query?.mode),
      force: parseBooleanFlag(req.body?.force ?? req.query?.force),
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }

    res.json({
      ...out.screening,
      matchedSkills: parseList(out.screening.matchedSkills),
      missingSkills: parseList(out.screening.missingSkills),
      strengths: parseList(out.screening.strengths),
      risks: parseList(out.screening.risks),
    });
  } catch (err) {
    console.error("[ai] /screen (path-param) failed:", (err as Error)?.stack ?? err);
    res.status(500).json({
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
              await runAndPersistScreening(c.id, jobId, { mode, force });
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

    res.json({ jobId, jobTitle: job.title, rankings });
  } catch (err) {
    console.error("Ranking error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Ranking failed" });
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
    res.json({
      ...saved,
      candidateId,
      strengths: summary.strengths,
      risks: summary.risks,
      likelyFitAreas: summary.likelyFitAreas,
      missingCapabilities: summary.missingCapabilities,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Summary generation failed" });
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

    res.json({
      ...saved,
      candidateId,
      strengths: summary.strengths,
      risks: summary.risks,
      likelyFitAreas: summary.likelyFitAreas,
      missingCapabilities: summary.missingCapabilities,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Summary generation failed" });
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
    res.json(out);
  } catch (err) {
    console.error("Interview questions error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Interview question generation failed" });
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
    res.json(out);
  } catch (err) {
    console.error("Interview questions error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Interview question generation failed" });
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
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch interview questions" });
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
    res.json(result);
  } catch (err) {
    console.error("JD generation error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "JD generation failed" });
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
    res.json(result);
  } catch (err) {
    console.error("JD improve error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "JD improvement failed" });
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
    res.json(screening);
  } catch (err) {
    console.error("Fetch screening error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch screening result" });
  }
});

export default router;
