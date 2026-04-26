import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

/**
 * Returns the authenticated user's profile.
 * Authentication is performed by the Supabase JWT middleware; this route
 * simply echoes `req.user` so the frontend can hydrate its auth state.
 */
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

/**
 * Logout is handled entirely client-side via supabase.auth.signOut().
 * This endpoint exists for API symmetry with the old session-based flow
 * and to give the frontend a single point to hit if it later wants to
 * record a server-side audit event.
 */
router.post("/logout", (_req, res) => {
  res.json({ message: "Logged out" });
});

export default router;
