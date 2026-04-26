import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { prisma } from "@workspace/db";

const router: IRouter = Router();

async function healthHandler(_req: any, res: any) {
  let dbStatus: "connected" | "down" = "down";
  try {
    await prisma.$queryRaw<Array<{ one: number }>>`SELECT 1 as one`;
    dbStatus = "connected";
  } catch (err) {
    console.error("[Health] DB ping failed:", err);
    dbStatus = "down";
  }
  res.json({ status: "ok", db: dbStatus });
}

// Primary health endpoint (spec: GET /api/health)
router.get("/health", healthHandler);
// Also expose at root of this router for flexibility under prefixed mounts
router.get("/", healthHandler);

// Back-compat: simple status-only healthz
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
