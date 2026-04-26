import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized", message: "Please log in to access this resource" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized", message: "Please log in" });
  }
  if (req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Forbidden", message: "Admin access required" });
  }
  next();
}
