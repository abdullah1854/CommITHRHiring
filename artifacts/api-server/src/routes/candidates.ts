import { Router } from "express";
import { prisma, parseList, serializeList } from "@workspace/db";
import type { Candidate } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth.js";
import { sendEmail } from "../lib/email.js";
import { scrapeLinkedInProfile, detectDiscrepancies } from "../lib/apifyService.js";
import { candidatePublicSelect } from "../lib/prismaSafeSelects.js";
import { forgetCandidateFromCache } from "../lib/screeningCache.js";

const router = Router();

const VALID_STATUSES = new Set([
  "new",
  "reviewing",
  "shortlisted",
  "interview_scheduled",
  "rejected",
  "hired",
]);

function normalizeStatus(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return undefined;
  const lower = raw.trim().toLowerCase();
  return lower.length > 0 ? lower : undefined;
}

function hydrateCandidate<T extends { skills?: unknown } | null | undefined>(c: T): T {
  if (!c) return c;
  return { ...(c as any), skills: parseList((c as any).skills) } as T;
}

function parseLinkedInData(raw: unknown): { profile: any | null; discrepancies: string[] } {
  if (!raw || typeof raw !== "string") return { profile: null, discrepancies: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      profile: parsed?.profile ?? null,
      discrepancies: parseList(parsed?.discrepancies),
    };
  } catch {
    return { profile: null, discrepancies: [] };
  }
}

async function getCandidateDetailBase(id: string) {
  try {
    return await prisma.candidate.findFirst({
      where: { id },
      select: {
        ...candidatePublicSelect,
        linkedinUrl: true,
        linkedinStatus: true,
        linkedinData: true,
      } as any,
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (err?.code === "P2022" || /linkedin_(url|status|data)|linkedinUrl|linkedinStatus|linkedinData|Invalid column/i.test(msg)) {
      console.warn("[candidates] LinkedIn columns unavailable; loading candidate without enrichment fields.");
      return prisma.candidate.findFirst({
        where: { id },
        select: candidatePublicSelect,
      });
    }
    throw err;
  }
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { jobId, status, search } = req.query as Record<string, string | undefined>;

    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus && !VALID_STATUSES.has(normalizedStatus)) {
      return res.status(400).json({ error: "Bad Request", message: `Invalid status "${status}"` });
    }

    if (jobId) {
      const candidateWhere: any = {};
      if (normalizedStatus) candidateWhere.status = normalizedStatus;

      const [apps, total] = await Promise.all([
        prisma.application.findMany({
          where: {
            jobId,
            ...(Object.keys(candidateWhere).length ? { candidate: candidateWhere } : {}),
          },
          include: { candidate: { select: candidatePublicSelect } },
          take: limit,
          skip: offset,
        }),
        prisma.application.count({ where: { jobId } }),
      ]);

      let appCandidates = apps.map((a) => a.candidate).filter(Boolean) as Candidate[];
      if (search) {
        const needle = String(search).toLowerCase();
        appCandidates = appCandidates.filter(
          (c) =>
            c.fullName?.toLowerCase().includes(needle) ||
            c.email?.toLowerCase().includes(needle),
        );
      }

      const hydrated = appCandidates.map((c) => hydrateCandidate(c));
      const candidatesWithScores = await enrichWithScores(hydrated, jobId);

      return res.json({
        candidates: candidatesWithScores,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const where: any = {};
    if (normalizedStatus) where.status = normalizedStatus;
    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [candidateList, total] = await Promise.all([
      prisma.candidate.findMany({
        select: candidatePublicSelect,
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      prisma.candidate.count({ where }),
    ]);

    const hydrated = candidateList.map((c) => hydrateCandidate(c));
    const enriched = await enrichGlobalCandidates(hydrated);

    res.json({
      candidates: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[candidates] list failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch candidates" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const candidate = await prisma.candidate.findFirst({
      where: { id },
      select: candidatePublicSelect,
    });
    if (!candidate) {
      return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
    }

    const jobIdFilter = (req.query.jobId as string | undefined) || undefined;
    const screeningWhere: any = { candidateId: id };
    if (jobIdFilter) screeningWhere.jobId = jobIdFilter;

    const [resumeData, screeningData, interviewData, appData, summaryData] = await Promise.all([
      prisma.resume.findFirst({ where: { candidateId: id } }),
      prisma.aiScreeningResult.findMany({
        where: screeningWhere,
        orderBy: { createdAt: "desc" },
      }),
      prisma.interview.findMany({
        where: { candidateId: id },
        orderBy: { scheduledAt: "desc" },
      }),
      prisma.application.findMany({
        where: { candidateId: id },
        include: { job: true },
      }),
      prisma.aiCandidateSummary.findFirst({
        where: { candidateId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const hydrateScreening = (s: any) =>
      s
        ? {
            ...s,
            matchedSkills: parseList(s.matchedSkills),
            missingSkills: parseList(s.missingSkills),
            strengths: parseList(s.strengths),
            risks: parseList(s.risks),
          }
        : s;

    const hydrateSummary = (s: any) =>
      s
        ? {
            ...s,
            strengths: parseList(s.strengths),
            risks: parseList(s.risks),
            likelyFitAreas: parseList(s.likelyFitAreas),
            missingCapabilities: parseList(s.missingCapabilities),
          }
        : s;

    const hydratedScreenings = screeningData.map(hydrateScreening);
    const latestScreening = hydratedScreenings[0] ?? null;

    // Parse stored LinkedIn data
    res.json({
      ...hydrateCandidate(candidate),
      latestScreening,
      latestScore: latestScreening?.matchScore ?? null,
      latestFit: latestScreening?.fitLabel ?? null,
      resume: resumeData ?? null,
      screeningResults: hydratedScreenings,
      interviews: interviewData,
      jobApplications: appData.map((a) => ({
        ...a,
        job: a.job
          ? {
              ...a.job,
              requiredSkills: parseList((a.job as any).requiredSkills),
              preferredSkills: parseList((a.job as any).preferredSkills),
              candidateCount: 0,
            }
          : null,
      })),
      aiSummary: hydrateSummary(summaryData),
      linkedinUrl: null,
      linkedinStatus: null,
      linkedinProfile: null,
      linkedinDiscrepancies: [],
    });
  } catch (err) {
    console.error("[candidates] get failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch candidate" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      location,
      skills,
      experienceSummary,
      educationSummary,
      pastRoles,
      status,
      recruiterNotes,
      currentJobId,
    } = req.body ?? {};

    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return res.status(400).json({ error: "Bad Request", message: "fullName is required" });
    }
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Bad Request", message: "email is required" });
    }

    const normalizedStatus = normalizeStatus(status) ?? "new";
    if (!VALID_STATUSES.has(normalizedStatus)) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: `Invalid status "${status}"` });
    }

    const candidate = await prisma.candidate.create({
      data: {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone ?? null,
        location: location ?? null,
        skills: serializeList(Array.isArray(skills) ? skills : []),
        experienceSummary: experienceSummary ?? null,
        educationSummary: educationSummary ?? null,
        pastRoles: pastRoles ?? null,
        status: normalizedStatus,
        recruiterNotes: recruiterNotes ?? null,
        currentJobId: currentJobId ?? null,
      },
      select: candidatePublicSelect,
    });

    res.status(201).json(hydrateCandidate(candidate));
  } catch (err) {
    console.error("[candidates] create failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create candidate" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const allowed = [
      "fullName",
      "email",
      "phone",
      "location",
      "skills",
      "experienceSummary",
      "educationSummary",
      "pastRoles",
      "recruiterNotes",
      "currentJobId",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.skills !== undefined) {
      updates.skills = serializeList(updates.skills);
    }

    if (req.body?.status !== undefined) {
      const normalizedStatus = normalizeStatus(req.body.status);
      if (!normalizedStatus || !VALID_STATUSES.has(normalizedStatus)) {
        return res
          .status(400)
          .json({ error: "Bad Request", message: `Invalid status "${req.body.status}"` });
      }
      updates.status = normalizedStatus;
    }

    try {
      const candidate = await prisma.candidate.update({
        where: { id },
        data: updates,
        select: candidatePublicSelect,
      });
      res.json(hydrateCandidate(candidate));
    } catch (e: any) {
      if (e?.code === "P2025") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      throw e;
    }
  } catch (err) {
    console.error("[candidates] update failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update candidate" });
  }
});

router.post("/:id/shortlist", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    try {
      const candidate = await prisma.candidate.update({
        where: { id },
        data: { status: "shortlisted" },
        select: candidatePublicSelect,
      });
      res.json(hydrateCandidate(candidate));
    } catch (e: any) {
      if (e?.code === "P2025") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      throw e;
    }
  } catch (err) {
    console.error("[candidates] shortlist failed:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to shortlist candidate" });
  }
});

router.post("/:id/reject", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { reason, jobId } = req.body ?? {};

    let candidate;
    try {
      candidate = await prisma.candidate.update({
        where: { id },
        data: {
          status: "rejected",
          ...(reason !== undefined ? { recruiterNotes: reason } : {}),
        },
        select: candidatePublicSelect,
      });
    } catch (e: any) {
      if (e?.code === "P2025") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      throw e;
    }

    if (jobId) {
      await prisma.aiScreeningResult.updateMany({
        where: { candidateId: id, jobId },
        data: { hrDecision: "rejected" },
      });
    }

    // Queue a rejection notification if the candidate has an email.
    if (candidate.email) {
      try {
        const subject = "Update on your application";
        const body = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <p>Dear ${candidate.fullName},</p>
            <p>Thank you for your interest and for the time you invested in our process.
            After careful review we have decided to move forward with other candidates at this time.</p>
            ${reason ? `<p>${reason}</p>` : ""}
            <p>We will keep your profile on file and wish you every success in your search.</p>
            <p>Best regards,<br/><strong>GIQ Recruitment Team</strong></p>
          </div>
        `;

        void sendEmail({
          to: candidate.email,
          toName: candidate.fullName,
          subject,
          html: body,
          type: "rejection",
        }).catch((e) => console.error("[candidates] rejection email failed:", e));
      } catch (notifErr) {
        console.error("[candidates] failed to queue rejection notification:", notifErr);
      }
    }

    res.json(hydrateCandidate(candidate));
  } catch (err) {
    console.error("[candidates] reject failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to reject candidate" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const exists = await prisma.candidate.findFirst({ where: { id }, select: { id: true } });
    if (!exists) {
      return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
    }
    await prisma.$transaction(async (tx) => {
      await tx.aiScreeningResult.deleteMany({ where: { candidateId: id } });
      await tx.interview.deleteMany({ where: { candidateId: id } });
      await tx.application.deleteMany({ where: { candidateId: id } });
      await tx.resume.deleteMany({ where: { candidateId: id } });
      await tx.aiCandidateSummary.deleteMany({ where: { candidateId: id } });
      await tx.candidate.deleteMany({ where: { id } });
    });
    forgetCandidateFromCache(id);
    res.json({ message: "Candidate deleted" });
  } catch (err) {
    console.error("[candidates] delete failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete candidate" });
  }
});

/**
 * POST /candidates/:id/scrape-linkedin
 * Manually trigger (or re-trigger) LinkedIn scraping for a candidate.
 * Accepts optional body: { linkedinUrl: string } to set/override the URL.
 */
router.post("/:id/scrape-linkedin", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const candidate = await prisma.candidate.findFirst({ where: { id } });
    if (!candidate) {
      return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
    }

    const overrideUrl = (req.body?.linkedinUrl as string | undefined)?.trim();
    const linkedinUrl = overrideUrl || (candidate as any).linkedinUrl;

    if (!linkedinUrl) {
      return res.status(400).json({ error: "Bad Request", message: "No LinkedIn URL available. Provide linkedinUrl in the request body." });
    }

    // Mark as pending immediately so the UI can show progress
    await prisma.candidate.update({
      where: { id },
      data: { linkedinUrl, linkedinStatus: "pending", linkedinData: null },
    });

    res.json({ message: "LinkedIn scraping started", linkedinUrl, status: "pending" });

    // Background scrape after response is sent
    void (async () => {
      try {
        const { status, profile } = await scrapeLinkedInProfile(linkedinUrl);
        let discrepancies: string[] = [];
        if (status === "verified" && profile) {
          discrepancies = detectDiscrepancies(
            {
              fullName: candidate.fullName,
              skills: parseList(candidate.skills),
              experienceSummary: candidate.experienceSummary,
              educationSummary: candidate.educationSummary,
            },
            profile,
          );
        }
        await prisma.candidate.update({
          where: { id },
          data: {
            linkedinStatus: status,
            linkedinData: profile ? JSON.stringify({ profile, discrepancies }) : null,
          },
        });
        console.log(`[candidates] LinkedIn scrape for ${id}: ${status}, discrepancies=${discrepancies.length}`);
      } catch (scrapeErr) {
        console.error("[candidates] Background LinkedIn scrape failed:", scrapeErr);
        await prisma.candidate.update({
          where: { id },
          data: { linkedinStatus: "failed" },
        }).catch((updateErr) => {
          console.error("[candidates] Failed to mark linkedinStatus=failed after scrape error:", updateErr, "Original scrape error:", scrapeErr);
        });
      }
    })();
  } catch (err) {
    console.error("[candidates] scrape-linkedin failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to start LinkedIn scraping" });
  }
});

async function enrichGlobalCandidates(candidateList: any[]) {
  if (candidateList.length === 0) return candidateList;
  const ids = candidateList.map((c) => c.id);

  const screenings = await prisma.aiScreeningResult.findMany({
    where: { candidateId: { in: ids } },
    orderBy: { createdAt: "desc" },
  });

  const latestMap = new Map<string, (typeof screenings)[number]>();
  for (const s of screenings) {
    if (!latestMap.has(s.candidateId)) latestMap.set(s.candidateId, s);
  }

  return candidateList.map((c) => {
    const s = latestMap.get(c.id);
    return { ...c, latestScore: s?.matchScore ?? null, latestFit: s?.fitLabel ?? null };
  });
}

async function enrichWithScores(candidateList: any[], jobId: string) {
  if (candidateList.length === 0) return candidateList;
  const ids = candidateList.map((c) => c.id);

  const screenings = await prisma.aiScreeningResult.findMany({
    where: { candidateId: { in: ids }, jobId },
    orderBy: { createdAt: "desc" },
  });

  const scoreMap = new Map<string, (typeof screenings)[number]>();
  for (const s of screenings) {
    if (!scoreMap.has(s.candidateId)) scoreMap.set(s.candidateId, s);
  }

  return candidateList.map((c) => {
    const s = scoreMap.get(c.id);
    return { ...c, latestScore: s?.matchScore ?? null, latestFit: s?.fitLabel ?? null };
  });
}

export default router;
