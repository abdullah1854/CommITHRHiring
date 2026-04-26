import { Router } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const CANDIDATE_STATUSES = [
  "new",
  "reviewing",
  "shortlisted",
  "interview_scheduled",
  "rejected",
  "hired",
] as const;

/**
 * GET /api/analytics/overview
 */
router.get("/overview", requireAuth, async (_req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);

    const [
      totalOpenJobs,
      totalCandidates,
      totalInterviewsScheduled,
      shortlistedCount,
      rejectedCount,
      pendingCount,
      aiScreeningCount,
      avgScoreAgg,
      hiresThisMonth,
      newCandidatesThisWeek,
    ] = await Promise.all([
      prisma.job.count({ where: { status: "open" } }),
      prisma.candidate.count(),
      prisma.interview.count({ where: { status: "scheduled" } }),
      prisma.candidate.count({ where: { status: "shortlisted" } }),
      prisma.candidate.count({ where: { status: "rejected" } }),
      prisma.candidate.count({ where: { status: { in: ["new", "reviewing"] } } }),
      prisma.aiScreeningResult.count(),
      prisma.aiScreeningResult.aggregate({ _avg: { matchScore: true } }),
      prisma.candidate.count({
        where: { status: "hired", updatedAt: { gte: startOfMonth } },
      }),
      prisma.candidate.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const averageMatchScore =
      avgScoreAgg._avg.matchScore != null
        ? Math.round(Number(avgScoreAgg._avg.matchScore) * 10) / 10
        : 0;

    res.json({
      totalOpenJobs,
      totalCandidates,
      totalInterviewsScheduled,
      shortlistedCount,
      rejectedCount,
      pendingCount,
      aiScreeningCount,
      averageMatchScore,
      hiresThisMonth,
      newCandidatesThisWeek,
    });
  } catch (err) {
    console.error("[analytics/overview]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch overview analytics",
    });
  }
});

/**
 * GET /api/analytics/pipeline → { funnel: [{stage, count}] }
 */
router.get("/pipeline", requireAuth, async (_req, res) => {
  try {
    const rows = await prisma.candidate.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const map = new Map<string, number>(
      rows.map((r: any) => [r.status as string, r._count._all]),
    );

    const funnel = CANDIDATE_STATUSES.map((stage) => ({
      stage,
      count: map.get(stage) ?? 0,
    }));

    res.json({ funnel });
  } catch (err) {
    console.error("[analytics/pipeline]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch pipeline analytics",
    });
  }
});

/**
 * GET /api/analytics/activity?days=30 → { data: [{date, candidatesAdded, interviewsScheduled, screeningsCompleted}] }
 */
router.get("/activity", requireAuth, async (req, res) => {
  try {
    const parsed = parseInt(String(req.query.days ?? "30"), 10);
    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 365) {
      return res.status(400).json({
        error: "Bad Request",
        message: "`days` must be an integer between 1 and 365",
      });
    }
    const days = parsed;

    const today = new Date();
    const startDate = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - (days - 1),
      ),
    );

    const [candidateRecords, interviewRecords, screeningRecords] =
      await Promise.all([
        prisma.candidate.findMany({
          where: { createdAt: { gte: startDate } },
          select: { createdAt: true },
        }),
        prisma.interview.findMany({
          where: { scheduledAt: { gte: startDate } },
          select: { scheduledAt: true },
        }),
        prisma.aiScreeningResult.findMany({
          where: { createdAt: { gte: startDate } },
          select: { createdAt: true },
        }),
      ]);

    const bucket = (d: Date) => d.toISOString().slice(0, 10);
    const candidateMap = new Map<string, number>();
    for (const c of candidateRecords) {
      const k = bucket(c.createdAt);
      candidateMap.set(k, (candidateMap.get(k) ?? 0) + 1);
    }
    const interviewMap = new Map<string, number>();
    for (const i of interviewRecords) {
      const k = bucket(i.scheduledAt);
      interviewMap.set(k, (interviewMap.get(k) ?? 0) + 1);
    }
    const screeningMap = new Map<string, number>();
    for (const s of screeningRecords) {
      const k = bucket(s.createdAt);
      screeningMap.set(k, (screeningMap.get(k) ?? 0) + 1);
    }

    const data: Array<{
      date: string;
      candidatesAdded: number;
      interviewsScheduled: number;
      screeningsCompleted: number;
    }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      const key = bucket(d);
      data.push({
        date: key,
        candidatesAdded: candidateMap.get(key) ?? 0,
        interviewsScheduled: interviewMap.get(key) ?? 0,
        screeningsCompleted: screeningMap.get(key) ?? 0,
      });
    }

    res.json({ data });
  } catch (err) {
    console.error("[analytics/activity]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch activity trends",
    });
  }
});

/**
 * GET /api/analytics/jobs → { jobs: [{jobId, jobTitle, department, candidateCount, averageScore, interviewCount, status}] }
 */
router.get("/jobs", requireAuth, async (_req, res) => {
  try {
    const jobList = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        department: true,
        status: true,
      },
    });

    if (jobList.length === 0) {
      return res.json({ jobs: [] });
    }

    const jobIds = jobList.map((j: any) => j.id);

    const [candidateCountRows, interviewsRows, avgScoreRows] =
      await Promise.all([
        prisma.application.groupBy({
          by: ["jobId"],
          where: { jobId: { in: jobIds } },
          _count: { _all: true },
        }),
        prisma.interview.groupBy({
          by: ["jobId"],
          where: { jobId: { in: jobIds } },
          _count: { _all: true },
        }),
        prisma.aiScreeningResult.groupBy({
          by: ["jobId"],
          where: { jobId: { in: jobIds } },
          _avg: { matchScore: true },
        }),
      ]);

    const candidateMap = new Map(
      candidateCountRows.map((r: any) => [r.jobId, r._count._all]),
    );
    const interviewsMap = new Map(
      interviewsRows.map((r: any) => [r.jobId, r._count._all]),
    );
    const scoreMap = new Map(
      avgScoreRows.map((r: any) => [
        r.jobId,
        r._avg.matchScore != null
          ? Math.round(Number(r._avg.matchScore) * 10) / 10
          : 0,
      ]),
    );

    const jobs = jobList.map((job: any) => ({
      jobId: job.id,
      jobTitle: job.title,
      department: job.department ?? "",
      candidateCount: candidateMap.get(job.id) ?? 0,
      averageScore: scoreMap.get(job.id) ?? 0,
      interviewCount: interviewsMap.get(job.id) ?? 0,
      status: job.status ?? "open",
    }));

    res.json({ jobs });
  } catch (err) {
    console.error("[analytics/jobs]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch per-job analytics",
    });
  }
});

export default router;
