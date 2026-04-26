import { Router } from "express";
import { prisma } from "@workspace/db";
import type { EmailNotification } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

/**
 * The `email_notifications` table has no dedicated `user_id` or `is_read`
 * column. We scope notifications to the current user by `recipient_email`
 * and treat `sent_at` as the "read" timestamp for the purposes of this API
 * (set when the user marks the notification as read).
 */
function toApi(n: EmailNotification) {
  return {
    id: n.id,
    type: n.type,
    subject: n.subject,
    body: n.body,
    recipientEmail: n.recipientEmail,
    recipientName: n.recipientName,
    status: n.status,
    isRead: !!n.sentAt,
    readAt: n.sentAt,
    createdAt: n.createdAt,
  };
}

/**
 * GET /api/notifications
 * Returns the 50 most recent notifications for the authenticated user
 * (by recipientEmail), newest first.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const email = req.session.userEmail;
    if (!email) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Session is missing the user's email",
      });
    }

    const rows = await prisma.emailNotification.findMany({
      where: { recipientEmail: email },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(rows.map(toApi));
  } catch (err) {
    console.error("[notifications/list]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch notifications",
    });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Marks a notification as read for the current user. Returns 404 if the
 * notification does not exist or is not owned by the caller.
 */
router.put("/:id/read", requireAuth, async (req, res) => {
  try {
    const email = req.session.userEmail;
    if (!email) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Session is missing the user's email",
      });
    }

    const id = req.params.id as string;
    if (!id) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: "Notification id is required" });
    }

    const result = await prisma.emailNotification.updateMany({
      where: { id, recipientEmail: email },
      data: { sentAt: new Date() },
    });

    if (result.count === 0) {
      return res.status(404).json({
        error: "Not Found",
        message: "Notification not found",
      });
    }

    const updated = await prisma.emailNotification.findFirst({ where: { id } });
    if (!updated) {
      return res.status(404).json({
        error: "Not Found",
        message: "Notification not found",
      });
    }

    res.json(toApi(updated));
  } catch (err) {
    console.error("[notifications/read]", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to mark notification as read",
    });
  }
});

export default router;
