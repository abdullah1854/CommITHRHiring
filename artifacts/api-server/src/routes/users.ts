import { Router } from "express";
import { prisma } from "@workspace/db";
import type { User } from "@workspace/db/schema";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const router = Router();

function sanitizeUser(user: User) {
  const { passwordHash, ...safe } = user;
  return safe;
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const role = req.query.role as string | undefined;

    const where = role ? { role } : {};

    const [userList, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: userList.map(sanitizeUser),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch users" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, name, role, password } = req.body;

    if (!email || !name || !role) {
      return res.status(400).json({ error: "Bad Request", message: "email, name, role are required" });
    }

    const existing = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: "Conflict", message: "User with this email already exists" });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        role,
        passwordHash,
        isActive: true,
      },
    });

    res.status(201).json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create user" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id as string } });
    if (!user) {
      return res.status(404).json({ error: "Not Found", message: "User not found" });
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch user" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, role, isActive } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;

    try {
      const user = await prisma.user.update({
        where: { id: req.params.id as string },
        data: updates,
      });
      res.json(sanitizeUser(user));
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Not Found", message: "User not found" });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update user" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if ((req.params.id as string) === req.session.userId) {
      return res.status(400).json({ error: "Bad Request", message: "Cannot delete your own account" });
    }
    await prisma.user.delete({ where: { id: req.params.id as string } });
    res.json({ message: "User deleted" });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Not Found", message: "User not found" });
    }
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete user" });
  }
});

export default router;
