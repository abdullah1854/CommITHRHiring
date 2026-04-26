import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma, parseList, serializeList } from "@workspace/db";
import type { Job } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth.js";
import { candidatePublicSelect } from "../lib/prismaSafeSelects.js";

const router = Router();

const VALID_JOB_STATUSES = new Set(["draft", "open", "closed", "archived"]);
const VALID_EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship"]);
const VALID_SENIORITIES = new Set(["entry", "mid", "senior", "lead", "executive"]);

function normalizeEnum(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return undefined;
  const lower = raw.trim().toLowerCase();
  return lower.length > 0 ? lower : undefined;
}

function hydrateJob<T extends { requiredSkills?: unknown; preferredSkills?: unknown } | null | undefined>(j: T): T {
  if (!j) return j;
  return {
    ...(j as any),
    requiredSkills: parseList((j as any).requiredSkills),
    preferredSkills: parseList((j as any).preferredSkills),
  } as T;
}

function sanitizeUser(user: any) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function sanitizePublicJob(job: any) {
  const { minSalary, maxSalary, salaryCurrency, ...safe } = job;
  return safe;
}

/**
 * List jobs. Supports a public mode via `?public=true` that skips auth and
 * restricts results to open jobs.
 */
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  const isPublic = (req.query.public as string | undefined) === "true";
  if (isPublic) return listJobs(req, res).catch(next);
  return requireAuth(req, res, () => listJobs(req, res).catch(next));
});

async function listJobs(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const {
      status,
      department,
      location,
      employmentType,
      search,
      public: isPublicRaw,
    } = req.query as Record<string, string | undefined>;

    const where: any = {};

    if (isPublicRaw === "true") {
      where.status = "open";
    } else if (status) {
      const s = normalizeEnum(status);
      if (!s || !VALID_JOB_STATUSES.has(s)) {
        return res.status(400).json({ error: "Bad Request", message: `Invalid status "${status}"` });
      }
      where.status = s;
    }

    if (department) where.department = department;
    if (location) where.location = { contains: location };
    if (employmentType) {
      const et = normalizeEnum(employmentType);
      if (!et || !VALID_EMPLOYMENT_TYPES.has(et)) {
        return res.status(400).json({
          error: "Bad Request",
          message: `Invalid employmentType "${employmentType}"`,
        });
      }
      where.employmentType = et;
    }
    if (search) where.title = { contains: search };

    const [jobList, total] = await Promise.all([
      prisma.job.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: { createdBy: true },
      }),
      prisma.job.count({ where }),
    ]);

    const jobIds = jobList.map((j) => j.id);
    const candidateCounts =
      jobIds.length > 0
        ? await prisma.application.groupBy({
            by: ["jobId"],
            where: { jobId: { in: jobIds } },
            _count: { _all: true },
          })
        : [];

    const countMap = new Map(candidateCounts.map((c: any) => [c.jobId, Number(c._count._all)]));

    const isPublicReq = isPublicRaw === "true";
    res.json({
      jobs: jobList.map((j) => {
        const hydrated = {
          ...hydrateJob(j),
          createdBy: (j as any).createdBy ? sanitizeUser((j as any).createdBy) : null,
          candidateCount: countMap.get(j.id) ?? 0,
        };
        return isPublicReq ? sanitizePublicJob(hydrated) : hydrated;
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[jobs] list failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch jobs" });
  }
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      title,
      department,
      location,
      employmentType,
      seniority,
      requiredSkills,
      preferredSkills,
      minExperience,
      maxExperience,
      minSalary,
      maxSalary,
      salaryCurrency,
      description,
      responsibilities,
      qualifications,
      status,
    } = req.body ?? {};

    const missing: string[] = [];
    if (!title || typeof title !== "string" || !title.trim()) missing.push("title");
    if (!description || typeof description !== "string" || !description.trim())
      missing.push("description");
    if (!department || typeof department !== "string" || !department.trim()) missing.push("department");
    if (!seniority || typeof seniority !== "string" || !seniority.trim()) missing.push("seniority");

    if (missing.length > 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: `Missing required field(s): ${missing.join(", ")}`,
      });
    }

    const normalizedSeniority = normalizeEnum(seniority)!;
    if (!VALID_SENIORITIES.has(normalizedSeniority)) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: `Invalid seniority "${seniority}"` });
    }

    const normalizedEmploymentType = normalizeEnum(employmentType) ?? "full_time";
    if (!VALID_EMPLOYMENT_TYPES.has(normalizedEmploymentType)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `Invalid employmentType "${employmentType}"`,
      });
    }

    const normalizedStatus = normalizeEnum(status) ?? "open";
    if (!VALID_JOB_STATUSES.has(normalizedStatus)) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: `Invalid status "${status}"` });
    }

    const job = await prisma.job.create({
      data: {
        title: title.trim(),
        department: department.trim(),
        location: typeof location === "string" && location.trim() ? location.trim() : "Remote",
        employmentType: normalizedEmploymentType,
        seniority: normalizedSeniority,
        requiredSkills: serializeList(Array.isArray(requiredSkills) ? requiredSkills : []),
        preferredSkills: serializeList(Array.isArray(preferredSkills) ? preferredSkills : []),
        minExperience: minExperience ?? null,
        maxExperience: maxExperience ?? null,
        minSalary: minSalary ?? null,
        maxSalary: maxSalary ?? null,
        salaryCurrency: salaryCurrency ?? "USD",
        description: description.trim(),
        responsibilities: responsibilities ?? "",
        qualifications: qualifications ?? "",
        status: normalizedStatus,
        createdById: req.user?.id ?? null,
      },
    });

    res.status(201).json({ ...hydrateJob(job), candidateCount: 0 });
  } catch (err) {
    console.error("[jobs] create failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create job" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const job = await prisma.job.findFirst({
      where: { id },
      include: { createdBy: true },
    });
    if (!job) return res.status(404).json({ error: "Not Found", message: "Job not found" });

    const candidateCount = await prisma.application.count({ where: { jobId: id } });

    res.json({
      ...hydrateJob(job),
      createdBy: (job as any).createdBy ? sanitizeUser((job as any).createdBy) : null,
      candidateCount,
    });
  } catch (err) {
    console.error("[jobs] get failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch job" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const allowed = [
      "title",
      "department",
      "location",
      "employmentType",
      "seniority",
      "requiredSkills",
      "preferredSkills",
      "minExperience",
      "maxExperience",
      "minSalary",
      "maxSalary",
      "salaryCurrency",
      "description",
      "responsibilities",
      "qualifications",
      "status",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.status !== undefined) {
      const s = normalizeEnum(updates.status);
      if (!s || !VALID_JOB_STATUSES.has(s)) {
        return res
          .status(400)
          .json({ error: "Bad Request", message: `Invalid status "${updates.status}"` });
      }
      updates.status = s;
    }
    if (updates.employmentType !== undefined) {
      const et = normalizeEnum(updates.employmentType);
      if (!et || !VALID_EMPLOYMENT_TYPES.has(et)) {
        return res.status(400).json({
          error: "Bad Request",
          message: `Invalid employmentType "${updates.employmentType}"`,
        });
      }
      updates.employmentType = et;
    }
    if (updates.seniority !== undefined) {
      const s = normalizeEnum(updates.seniority);
      if (!s || !VALID_SENIORITIES.has(s)) {
        return res
          .status(400)
          .json({ error: "Bad Request", message: `Invalid seniority "${updates.seniority}"` });
      }
      updates.seniority = s;
    }
    if (updates.requiredSkills !== undefined) {
      updates.requiredSkills = serializeList(updates.requiredSkills);
    }
    if (updates.preferredSkills !== undefined) {
      updates.preferredSkills = serializeList(updates.preferredSkills);
    }

    let job;
    try {
      job = await prisma.job.update({ where: { id }, data: updates });
    } catch (e: any) {
      if (e?.code === "P2025") return res.status(404).json({ error: "Not Found", message: "Job not found" });
      throw e;
    }

    const candidateCount = await prisma.application.count({ where: { jobId: id } });

    res.json({ ...hydrateJob(job), candidateCount });
  } catch (err) {
    console.error("[jobs] update failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update job" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.job.findFirst({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }

    // Applications + AI screenings cascade automatically via Prisma schema
    // (onDelete: Cascade on Application, onDelete: NoAction on
    // AiScreeningResult — clean those up explicitly).
    await prisma.aiScreeningResult.deleteMany({ where: { jobId: id } });
    await prisma.job.delete({ where: { id } });

    res.json({ message: "Job deleted" });
  } catch (err) {
    console.error("[jobs] delete failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete job" });
  }
});

router.get("/:id/candidates", requireAuth, async (req, res) => {
  try {
    const jobId = req.params.id as string;
    const { status } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const where: any = { jobId };
    if (status) {
      const normalized = normalizeEnum(status)!;
      where.candidate = { status: normalized };
    }

    const [appList, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: { candidate: { select: candidatePublicSelect } },
        take: limit,
        skip: offset,
      }),
      prisma.application.count({ where: { jobId } }),
    ]);

    const candidateList = appList
      .map((a) => a.candidate)
      .filter(Boolean) as Array<{ id: string; skills: unknown }>;

    const candidateIds = candidateList.map((c) => c.id);
    const screenings =
      candidateIds.length > 0
        ? await prisma.aiScreeningResult.findMany({
            where: { candidateId: { in: candidateIds }, jobId },
            orderBy: { createdAt: "desc" },
          })
        : [];

    const scoreMap = new Map<string, (typeof screenings)[number]>();
    for (const s of screenings) {
      if (!scoreMap.has(s.candidateId)) scoreMap.set(s.candidateId, s);
    }

    res.json({
      candidates: candidateList.map((c: any) => {
        const s = scoreMap.get(c.id);
        return {
          ...c,
          skills: parseList(c.skills),
          latestScreening: s ?? null,
          latestScore: s?.matchScore ?? null,
          latestFit: s?.fitLabel ?? null,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[jobs] candidates list failed:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to fetch job candidates" });
  }
});

export default router;
