import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/supabase.js";

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

/**
 * Verifies a Supabase JWT, attaches the linked profile to `req.user`, and
 * passes through. Replaces the old express-session check.
 *
 * Failure modes:
 *  - 401 if no Bearer token, token invalid/expired, no mirrored profile,
 *    or profile.is_active === false.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "Missing bearer token" });
    return;
  }
  const user = await verifyAccessToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
    return;
  }
  req.user = user;
  next();
}

/**
 * Requires `requireAuth` to have run first (re-checks for safety) and the
 * authenticated user to have role === "admin".
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized", message: "Missing bearer token" });
      return;
    }
    const user = await verifyAccessToken(token);
    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
      return;
    }
    req.user = user;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }
  next();
}
