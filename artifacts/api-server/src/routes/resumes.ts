import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";
import { prisma, parseList, serializeList } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import {
  parseResumeText,
  extractEmailFromText,
  extractPhoneFromText,
  extractLinkedInUrl,
  resolveCandidateDisplayName,
  sanitizeExtractedSkills,
} from "../lib/resumeParser.js";
import { extractFullResumeData } from "../lib/aiService.js";
import { candidatePublicSelect } from "../lib/prismaSafeSelects.js";

// Disk storage: set UPLOAD_RESUMES_DIR on the server if cwd differs from the repo root (PM2 should set cwd to project root).
const uploadDir = process.env.UPLOAD_RESUMES_DIR
  ? path.resolve(process.env.UPLOAD_RESUMES_DIR)
  : path.join(process.cwd(), "uploads", "resumes");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
console.log(`[resumes] upload directory: ${uploadDir}`);

const ALLOWED_EXT = /\.(pdf|doc|docx)$/i;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || "";
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const okExt = ALLOWED_EXT.test(file.originalname);
    const okMime = ALLOWED_MIME.has(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    cb(new Error("Only PDF, DOC, and DOCX files are allowed"));
  },
});

const router = Router();

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function safeUnlink(p: string) {
  fs.promises.unlink(p).catch(() => {
    /* ignore */
  });
}

// POST /api/resumes/upload
router.post("/upload", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (uploadErr: unknown) => {
    if (uploadErr) {
      const msg =
        uploadErr instanceof Error ? uploadErr.message : "Upload failed";
      return res.status(400).json({ error: "Bad Request", message: msg });
    }
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: "No file uploaded" });
    }

    const file = req.file;
    const { jobId, candidateName } = (req.body ?? {}) as {
      jobId?: string;
      candidateName?: string;
    };

    try {
      // 1. Extract raw text + hash file bytes.
      // The sha256 is the determinism anchor for screening: same file bytes =
      // same cache key regardless of candidate/skills drift. Computed from the
      // on-disk buffer so the hash matches what we persist.
      let parsedText = "";
      let fileSha256: string | null = null;
      try {
        const fileBuffer = fs.readFileSync(file.path);
        fileSha256 = createHash("sha256").update(fileBuffer).digest("hex");
      } catch (e) {
        console.warn("Resume sha256 computation failed:", e);
      }
      try {
        parsedText = await parseResumeText(file.path, file.mimetype);
      } catch (e) {
        console.warn("Resume text extraction failed:", e);
        parsedText = "";
      }

      // 2. Call AI extractFullResumeData — fall back to regex on failure
      let extracted = {
        fullName: null as string | null,
        email: null as string | null,
        phone: null as string | null,
        location: null as string | null,
        currentTitle: null as string | null,
        yearsOfExperience: null as number | null,
        skills: [] as string[],
        experienceSummary: null as string | null,
        educationSummary: null as string | null,
        pastRoles: null as string | null,
      };

      if (parsedText && parsedText.trim().length > 50) {
        try {
          extracted = await extractFullResumeData(parsedText);
        } catch (e) {
          console.warn("AI extraction failed, falling back to regex:", e);
          extracted.email = extractEmailFromText(parsedText) ?? null;
          extracted.phone = extractPhoneFromText(parsedText) ?? null;
        }
      } else if (parsedText) {
        extracted.email = extractEmailFromText(parsedText) ?? null;
        extracted.phone = extractPhoneFromText(parsedText) ?? null;
      }

      const linkedinUrl = extractLinkedInUrl(parsedText);

      const resolvedName = resolveCandidateDisplayName({
        override: candidateName,
        aiFullName: extracted.fullName,
        resumeText: parsedText,
        filename: file.originalname,
      });
      const sanitizedSkills = sanitizeExtractedSkills(extracted.skills, resolvedName);

      // 3. Upsert candidate — by email when present, else create new
      let candidateId: string;
      if (extracted.email) {
        const existing = await prisma.candidate.findFirst({
          where: { email: extracted.email },
          select: candidatePublicSelect,
        });

        if (existing) {
          const existingSkills = parseList(existing.skills);
          const mergedSkills =
            sanitizedSkills.length > 0 ? sanitizedSkills : existingSkills;
          const updated = await prisma.candidate.update({
            where: { id: existing.id },
            data: {
              fullName: resolvedName || existing.fullName,
              phone: extracted.phone ?? existing.phone,
              location: extracted.location ?? existing.location,
              skills: serializeList(mergedSkills),
              experienceSummary:
                extracted.experienceSummary ?? existing.experienceSummary,
              educationSummary:
                extracted.educationSummary ?? existing.educationSummary,
              pastRoles: extracted.pastRoles ?? existing.pastRoles,
              currentJobId: jobId ?? existing.currentJobId,
            },
            select: candidatePublicSelect,
          });
          candidateId = updated.id;
        } else {
          const created = await prisma.candidate.create({
            data: {
              fullName: resolvedName,
              email: extracted.email,
              phone: extracted.phone ?? null,
              location: extracted.location ?? null,
              skills: serializeList(sanitizedSkills),
              experienceSummary: extracted.experienceSummary ?? null,
              educationSummary: extracted.educationSummary ?? null,
              pastRoles: extracted.pastRoles ?? null,
              status: "new",
              currentJobId: jobId ?? null,
            },
            select: candidatePublicSelect,
          });
          candidateId = created.id;
        }
      } else {
        const created = await prisma.candidate.create({
          data: {
            fullName: resolvedName,
            email: null,
            phone: extracted.phone ?? null,
            location: extracted.location ?? null,
            skills: serializeList(sanitizedSkills),
            experienceSummary: extracted.experienceSummary ?? null,
            educationSummary: extracted.educationSummary ?? null,
            pastRoles: extracted.pastRoles ?? null,
            status: "new",
            currentJobId: jobId ?? null,
          },
          select: candidatePublicSelect,
        });
        candidateId = created.id;
      }

      // 4. Insert resume row linking file path + raw text.
      // fileSha256 is tolerant of schema drift: if the DB predates the column,
      // fall back to inserting without it so uploads keep working.
      const fileUrl = `/api/resumes/files/${path.basename(file.path)}`;
      const resumeBaseData = {
        candidateId,
        fileName: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        parsedText: parsedText || null,
      };
      let resumeRow: any;
      try {
        resumeRow = await prisma.resume.create({
          data: { ...resumeBaseData, fileSha256: fileSha256 ?? undefined },
        });
      } catch (createErr: any) {
        const msg = String(createErr?.message ?? "");
        const code = createErr?.code;
        const looksLikeSchemaDrift =
          code === "P2022" || /file_sha256|Invalid column name/i.test(msg);
        if (!looksLikeSchemaDrift) throw createErr;
        console.warn(
          "[resumes] file_sha256 column missing; inserting without it. Run prisma db push on this server.",
        );
        resumeRow = await prisma.resume.create({ data: resumeBaseData });
      }

      // 5. Optional: link to job if provided (unique on candidateId+jobId)
      if (jobId) {
        try {
          await prisma.application.create({
            data: {
              candidateId,
              jobId,
              status: "applied",
            },
          });
        } catch (e: any) {
          // P2002 = unique constraint — already applied. Safe to ignore.
          if (e?.code !== "P2002") {
            console.warn("Failed to create application row:", e);
          }
        }
      }

      // LinkedIn enrichment is skipped here when DB schema omits linkedin_* columns (avoids 500 on upload).
      // Use POST /candidates/:id/scrape-linkedin after migrating the database.
      if (linkedinUrl) {
        console.log(`[resumes] LinkedIn URL detected for candidate ${candidateId}; scrape skipped until DB has linkedin columns.`);
      }

      return res.status(201).json({
        id: candidateId,
        candidateId,
        resumeId: resumeRow.id,
        parsedData: extracted,
        linkedinUrl: linkedinUrl ?? null,
        linkedinStatus: linkedinUrl ? "pending" : "skipped",
      });
    } catch (err) {
      console.error("Resume upload error:", err);
      // Cleanup the uploaded file so we don't orphan it
      if (file?.path) safeUnlink(file.path);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to process resume",
      });
    }
  });
});

// GET /api/resumes/files/:filename — serve uploaded file (auth required)
router.get("/files/:filename", requireAuth, (req, res) => {
  const requested = req.params.filename as string;

  // Prevent path traversal — only allow the basename
  const safeName = path.basename(requested);
  const filePath = path.join(uploadDir, safeName);

  if (!filePath.startsWith(uploadDir)) {
    return res
      .status(400)
      .json({ error: "Bad Request", message: "Invalid filename" });
  }
  if (!fs.existsSync(filePath)) {
    return res
      .status(404)
      .json({ error: "Not Found", message: "File not found" });
  }

  const ext = path.extname(safeName).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
  return res.sendFile(filePath);
});

// GET /api/resumes/:id — fetch resume row
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const resume = await prisma.resume.findFirst({ where: { id } });
    if (!resume) {
      return res
        .status(404)
        .json({ error: "Not Found", message: "Resume not found" });
    }
    return res.json(resume);
  } catch (err) {
    console.error("Fetch resume error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch resume",
    });
  }
});

export default router;
