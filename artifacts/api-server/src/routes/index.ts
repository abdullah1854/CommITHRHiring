import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import jobsRouter from "./jobs.js";
import candidatesRouter from "./candidates.js";
import resumesRouter from "./resumes.js";
import aiRouter from "./ai.js";
import interviewsRouter from "./interviews.js";
import analyticsRouter from "./analytics.js";
import notificationsRouter from "./notifications.js";
import jobTemplatesRouter from "./jobTemplates.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/jobs", jobsRouter);
router.use("/job-templates", jobTemplatesRouter);
router.use("/candidates", candidatesRouter);
router.use("/resumes", resumesRouter);
router.use("/ai", aiRouter);
router.use("/interviews", interviewsRouter);
router.use("/analytics", analyticsRouter);
router.use("/notifications", notificationsRouter);

export default router;
