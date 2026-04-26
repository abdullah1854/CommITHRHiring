import { Router } from "express";
import { prisma } from "@workspace/db";
import type { User } from "@workspace/db/schema";
import bcrypt from "bcryptjs";

const router = Router();

function sanitizeUser(user: User) {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

router.get("/me", async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
  }
  try {
    const user = await prisma.user.findFirst({ where: { id: req.session.userId } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to load session user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Bad Request", message: "Email and password are required" });
    }

    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || !user.passwordHash) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Login failed" });
  }
});

router.post("/demo-login", async (req, res) => {
  try {
    const role: "admin" | "recruiter" = req.body?.role === "admin" ? "admin" : "recruiter";
    const email = role === "admin" ? "admin@talentiq.demo" : "recruiter@talentiq.demo";
    const name = role === "admin" ? "Demo Admin" : "Demo Recruiter";

    const randomHash = await bcrypt.hash(
      "demo-" + Math.random().toString(36).slice(2) + Date.now().toString(36),
      10,
    );

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        role,
        passwordHash: randomHash,
        isActive: true,
      },
    });

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Demo login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Internal Server Error", message: "Logout failed" });
    }
    res.clearCookie("connect.sid", { path: "/" });
    res.json({ message: "Logged out successfully" });
  });
});

export default router;
