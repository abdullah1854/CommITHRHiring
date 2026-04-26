import { Router } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { generateInterviewIcs, sendEmail, interviewInviteTemplate } from "../lib/email.js";
import { candidatePublicSelect, jobListSelect } from "../lib/prismaSafeSelects.js";

const interviewInclude = {
  candidate: { select: candidatePublicSelect },
  job: { select: jobListSelect },
} as const;

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const { jobId, candidateId, status } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (jobId) where.jobId = jobId;
    if (candidateId) where.candidateId = candidateId;
    if (status) where.status = status;

    const [interviewList, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { scheduledAt: "desc" },
        include: interviewInclude,
      }),
      prisma.interview.count({ where }),
    ]);

    res.json({
      interviews: interviewList.map((i) => ({
        ...i,
        job: i.job ? { ...i.job, candidateCount: 0 } : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch interviews" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      candidateId, jobId, interviewerName, interviewType,
      scheduledAt, durationMinutes, location, meetingLink, notes, sendInvite,
    } = req.body;

    if (!candidateId || !jobId || !interviewerName || !interviewType || !scheduledAt) {
      return res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    }

    const interview = await prisma.interview.create({
      data: {
        candidateId,
        jobId,
        interviewerName,
        interviewType,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: durationMinutes ?? 60,
        location: location ?? null,
        meetingLink: meetingLink ?? null,
        notes: notes ?? null,
        status: "scheduled",
      },
    });

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "interview_scheduled", updatedAt: new Date() },
    });

    if (sendInvite) {
      const [candidate, job] = await Promise.all([
        prisma.candidate.findFirst({
          where: { id: candidateId },
          select: { email: true, fullName: true },
        }),
        prisma.job.findFirst({
          where: { id: jobId },
          select: { title: true },
        }),
      ]);

      if (candidate?.email && job) {
        const html = interviewInviteTemplate({
          candidateName: candidate.fullName,
          jobTitle: job.title,
          interviewerName,
          interviewType,
          scheduledAt: new Date(scheduledAt),
          durationMinutes: durationMinutes ?? 60,
          location,
          meetingLink,
        });

        await sendEmail({
          to: candidate.email,
          toName: candidate.fullName,
          subject: `Interview Invitation – ${job.title}`,
          html,
          type: "interview_invite",
        });

        await prisma.interview.update({
          where: { id: interview.id },
          data: { inviteSentAt: new Date() },
        });
      }
    }

    const fullInterview = await prisma.interview.findFirst({
      where: { id: interview.id },
      include: interviewInclude,
    });

    res.status(201).json({
      ...fullInterview,
      job: fullInterview?.job ? { ...fullInterview.job, candidateCount: 0 } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to schedule interview" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id as string },
      include: interviewInclude,
    });
    if (!interview) return res.status(404).json({ error: "Not Found", message: "Interview not found" });
    res.json({ ...interview, job: interview.job ? { ...interview.job, candidateCount: 0 } : null });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch interview" });
  }
});

router.get("/:id/ics", requireAuth, async (req, res) => {
  try {
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id as string },
      include: interviewInclude,
    });
    if (!interview) return res.status(404).json({ error: "Not Found", message: "Interview not found" });

    const ics = generateInterviewIcs({
      uid: interview.id,
      candidateName: interview.candidate?.fullName ?? "Candidate",
      jobTitle: interview.job?.title ?? "Position",
      interviewerName: interview.interviewerName,
      interviewType: interview.interviewType,
      scheduledAt: interview.scheduledAt,
      durationMinutes: interview.durationMinutes,
      location: interview.location,
      meetingLink: interview.meetingLink,
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="interview-${interview.id}.ics"`);
    res.send(ics);
  } catch (err) {
    console.error("[interviews] ics failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to generate calendar invite" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const allowed = [
      "interviewerName", "interviewType", "scheduledAt", "durationMinutes",
      "location", "meetingLink", "status", "notes",
    ];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = key === "scheduledAt" ? new Date(req.body[key]) : req.body[key];
      }
    }

    try {
      const interview = await prisma.interview.update({
        where: { id: req.params.id as string },
        data: updates,
      });

      const full = await prisma.interview.findFirst({
        where: { id: interview.id },
        include: interviewInclude,
      });

      res.json({ ...full, job: full?.job ? { ...full.job, candidateCount: 0 } : null });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Not Found", message: "Interview not found" });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update interview" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await prisma.interview.delete({
      where: { id: req.params.id as string },
    });
    res.json({ message: "Interview deleted" });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Not Found", message: "Interview not found" });
    }
    console.error("[interviews] delete failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete interview" });
  }
});

router.post("/:id/send-invite", requireAuth, async (req, res) => {
  try {
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id as string },
      include: interviewInclude,
    });

    if (!interview) return res.status(404).json({ error: "Not Found", message: "Interview not found" });

    if (!interview.candidate?.email) {
      return res.status(400).json({ error: "Bad Request", message: "Candidate has no email address" });
    }

    const html = interviewInviteTemplate({
      candidateName: interview.candidate.fullName,
      jobTitle: interview.job?.title ?? "Position",
      interviewerName: interview.interviewerName,
      interviewType: interview.interviewType,
      scheduledAt: interview.scheduledAt,
      durationMinutes: interview.durationMinutes,
      location: interview.location,
      meetingLink: interview.meetingLink,
    });

    await sendEmail({
      to: interview.candidate.email,
      toName: interview.candidate.fullName,
      subject: `Interview Invitation – ${interview.job?.title ?? "Position"}`,
      html,
      type: "interview_invite",
    });

    await prisma.interview.update({
      where: { id: req.params.id as string },
      data: { inviteSentAt: new Date() },
    });

    res.json({ message: "Interview invite sent" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error", message: "Failed to send invite" });
  }
});

export default router;
