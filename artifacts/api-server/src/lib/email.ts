import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { prisma } from "@workspace/db";

const hasSmtpConfig = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    })
  : null;

if (!transporter) {
  console.log(
    "[Email] SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS). Running in mock mode.",
  );
}

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  type?: string;
  ics?: {
    filename: string;
    content: string;
  };
}

export async function sendEmail(opts: SendEmailOptions): Promise<void>;
export async function sendEmail(to: string, subject: string, html: string): Promise<void>;
export async function sendEmail(
  arg1: SendEmailOptions | string,
  subject?: string,
  html?: string,
): Promise<void> {
  const opts: SendEmailOptions =
    typeof arg1 === "string"
      ? { to: arg1, subject: subject ?? "", html: html ?? "", type: "generic" }
      : { type: "generic", ...arg1 };

  return sendEmailInternal(opts);
}

async function sendEmailInternal(opts: SendEmailOptions): Promise<void> {
  const notifId = randomUUID();

  try {
    await prisma.emailNotification.create({
      data: {
        id: notifId,
        type: opts.type ?? "generic",
        recipientEmail: opts.to,
        recipientName: opts.toName,
        subject: opts.subject,
        body: opts.html,
        status: "pending",
      },
    });
  } catch (err) {
    // Don't block email send on notification-log failures (e.g. missing table)
    console.warn("[Email] Could not insert email_notifications row:", err);
  }

  const from = process.env.SMTP_FROM || '"GIQ" <noreply@giq.internal>';

  try {
    if (!transporter) {
      console.log("========== [Email Mock] ==========");
      console.log(`From:    ${from}`);
      console.log(`To:      ${opts.to}${opts.toName ? ` <${opts.toName}>` : ""}`);
      console.log(`Subject: ${opts.subject}`);
      console.log(`Body (HTML):\n${opts.html}`);
      console.log("==================================");
      try {
        await prisma.emailNotification.update({
          where: { id: notifId },
          data: { status: "sent", sentAt: new Date() },
        });
      } catch {}
      return;
    }

    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      icalEvent: opts.ics
        ? {
            filename: opts.ics.filename,
            method: "REQUEST",
            content: opts.ics.content,
          }
        : undefined,
    });

    try {
      await prisma.emailNotification.update({
        where: { id: notifId },
        data: { status: "sent", sentAt: new Date() },
      });
    } catch {}
  } catch (err) {
    try {
      await prisma.emailNotification.update({
        where: { id: notifId },
        data: { status: "failed", error: String(err) },
      });
    } catch {}
    console.error("[Email] Failed to send:", err);
  }
}

export function interviewInviteTemplate(opts: {
  candidateName: string;
  jobTitle: string;
  interviewerName: string;
  interviewType: string;
  scheduledAt: Date;
  durationMinutes: number;
  location?: string | null;
  meetingLink?: string | null;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Interview Invitation – ${opts.jobTitle}</h2>
      <p>Dear ${opts.candidateName},</p>
      <p>We are pleased to invite you for an interview for the <strong>${opts.jobTitle}</strong> position.</p>
      <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; font-weight: bold;">Interview Type:</td>
          <td style="padding: 8px;">${opts.interviewType.replace("_", " ")}</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td style="padding: 8px; font-weight: bold;">Date & Time:</td>
          <td style="padding: 8px;">${opts.scheduledAt.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Duration:</td>
          <td style="padding: 8px;">${opts.durationMinutes} minutes</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td style="padding: 8px; font-weight: bold;">Interviewer:</td>
          <td style="padding: 8px;">${opts.interviewerName}</td>
        </tr>
        ${opts.location ? `<tr><td style="padding: 8px; font-weight: bold;">Location:</td><td style="padding: 8px;">${opts.location}</td></tr>` : ""}
        ${opts.meetingLink ? `<tr style="background: #f8fafc;"><td style="padding: 8px; font-weight: bold;">Meeting Link:</td><td style="padding: 8px;"><a href="${opts.meetingLink}">${opts.meetingLink}</a></td></tr>` : ""}
      </table>
      <p>Please confirm your attendance by replying to this email.</p>
      <p>Best regards,<br/><strong>GIQ Recruitment Team</strong></p>
    </div>
  `;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildInterviewIcs(opts: {
  id: string;
  candidateName: string;
  jobTitle: string;
  interviewerName: string;
  interviewType: string;
  scheduledAt: Date;
  durationMinutes: number;
  location?: string | null;
  meetingLink?: string | null;
}): string {
  const start = opts.scheduledAt;
  const end = new Date(start.getTime() + opts.durationMinutes * 60_000);
  const summary = `Interview: ${opts.jobTitle} — ${opts.candidateName}`;
  const description = [
    `Interview type: ${opts.interviewType.replace(/_/g, " ")}`,
    `Interviewer: ${opts.interviewerName}`,
    opts.meetingLink ? `Meeting link: ${opts.meetingLink}` : null,
  ].filter(Boolean).join("\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GIQ//Recruitment Platform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.id}@giq-recruitment`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    opts.location ? `LOCATION:${escapeIcsText(opts.location)}` : null,
    opts.meetingLink ? `URL:${opts.meetingLink}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
