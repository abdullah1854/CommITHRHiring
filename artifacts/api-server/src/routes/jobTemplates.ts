import { Router } from "express";
import { prisma, parseList, serializeList } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

function toApi(row: any) {
  return {
    ...row,
    requiredSkills: parseList(row.requiredSkills),
    preferredSkills: parseList(row.preferredSkills),
  };
}

router.get("/", requireAuth, async (_req, res) => {
  try {
    const templates = await prisma.jobTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    res.json({ templates: templates.map(toApi) });
  } catch (err) {
    console.error("[job-templates] list failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch job templates" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      name,
      title,
      department,
      location,
      employmentType,
      seniority,
      requiredSkills,
      preferredSkills,
      description,
      responsibilities,
      qualifications,
    } = req.body ?? {};

    if (!name || !title || !department || !location || !employmentType || !seniority) {
      return res.status(400).json({
        error: "Bad Request",
        message: "name, title, department, location, employmentType, and seniority are required",
      });
    }

    const template = await prisma.jobTemplate.create({
      data: {
        name: String(name).trim(),
        title: String(title).trim(),
        department: String(department).trim(),
        location: String(location).trim(),
        employmentType: String(employmentType),
        seniority: String(seniority),
        requiredSkills: serializeList(requiredSkills),
        preferredSkills: serializeList(preferredSkills),
        description: String(description ?? ""),
        responsibilities: String(responsibilities ?? ""),
        qualifications: String(qualifications ?? ""),
        createdById: req.user?.id ?? null,
      },
    });

    res.status(201).json(toApi(template));
  } catch (err) {
    console.error("[job-templates] create failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create job template" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const allowed = [
      "name",
      "title",
      "department",
      "location",
      "employmentType",
      "seniority",
      "requiredSkills",
      "preferredSkills",
      "description",
      "responsibilities",
      "qualifications",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) data[key] = req.body[key];
    }
    if (data.requiredSkills !== undefined) data.requiredSkills = serializeList(data.requiredSkills);
    if (data.preferredSkills !== undefined) data.preferredSkills = serializeList(data.preferredSkills);

    const template = await prisma.jobTemplate.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(toApi(template));
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Not Found", message: "Job template not found" });
    }
    console.error("[job-templates] update failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update job template" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await prisma.jobTemplate.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Job template deleted" });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Not Found", message: "Job template not found" });
    }
    console.error("[job-templates] delete failed:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete job template" });
  }
});

export default router;
