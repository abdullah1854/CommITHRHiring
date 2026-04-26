import { Router } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

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
      users: userList,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch users" });
  }
});

/**
 * Admin-only: provisions a new user via Supabase Auth Admin API.
 * The `on_auth_user_created` Postgres trigger then mirrors the user into
 * `commit_hr.users` with the role from `user_metadata.role`. We post-update
 * the profile row to set `name` and override `role` if provided so the
 * caller doesn't have to wait for trigger metadata to flow through.
 */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, name, role, password } = req.body as {
      email?: string;
      name?: string;
      role?: string;
      password?: string;
    };

    if (!email || !name || !role || !password) {
      return res.status(400).json({
        error: "Bad Request",
        message: "email, name, role, password are required",
      });
    }

    const lowerEmail = email.toLowerCase();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: lowerEmail,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (error || !created.user) {
      const message = error?.message ?? "Failed to create user";
      const status = /already.*registered/i.test(message) ? 409 : 500;
      return res.status(status).json({ error: status === 409 ? "Conflict" : "Internal Server Error", message });
    }

    const profile = await prisma.user.update({
      where: { id: created.user.id },
      data: { name, role, isActive: true },
    });

    res.status(201).json(profile);
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
    res.json(user);
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
      res.json(user);
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
    const targetId = req.params.id as string;
    if (targetId === req.user?.id) {
      return res.status(400).json({ error: "Bad Request", message: "Cannot delete your own account" });
    }
    // Deleting the auth.users row cascades into commit_hr.users via the FK.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (error) {
      if (/not.*found/i.test(error.message)) {
        return res.status(404).json({ error: "Not Found", message: "User not found" });
      }
      throw error;
    }
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete user" });
  }
});

export default router;
