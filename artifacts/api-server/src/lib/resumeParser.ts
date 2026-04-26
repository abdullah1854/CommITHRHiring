import fs from "fs";
import path from "path";

/**
 * Resolve PDF text extraction across pdf-parse v1.x (default-export function)
 * and v2.x (named-export `PDFParse` class). Fails loudly so the server log
 * tells us why uploads silently produce empty parsed text.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");

  // pdf-parse@2.x — class API: new PDFParse({ data }).getText()
  if (mod && typeof mod.PDFParse === "function") {
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const parser = new mod.PDFParse({ data });
    try {
      const result: any = await parser.getText();
      const text =
        typeof result?.text === "string"
          ? result.text
          : Array.isArray(result?.pages)
          ? result.pages.map((p: any) => p?.text ?? "").join("\n")
          : "";
      return text;
    } finally {
      try {
        await parser.destroy?.();
      } catch {
        /* ignore */
      }
    }
  }

  // pdf-parse@1.x — default-export function: pdf(buffer)
  const v1Fn =
    typeof mod === "function"
      ? mod
      : typeof mod?.default === "function"
      ? mod.default
      : typeof mod?.default?.default === "function"
      ? mod.default.default
      : null;

  if (typeof v1Fn === "function") {
    const result: any = await v1Fn(buffer);
    return typeof result?.text === "string" ? result.text : "";
  }

  const exportNames = mod && typeof mod === "object" ? Object.keys(mod) : [];
  throw new Error(
    `pdf-parse module loaded but no usable export found. Got keys: [${exportNames.join(", ")}]`,
  );
}

export async function parseResumeText(filePath: string, mimeType: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") {
    try {
      const text = await extractPdfText(buffer);
      console.log(
        `[resumeParser] PDF extracted ${text.length} chars from ${path.basename(filePath)} (${buffer.length} bytes)`,
      );
      return text;
    } catch (err) {
      console.error(
        `[resumeParser] PDF parse failed for ${path.basename(filePath)}:`,
        (err as Error)?.stack ?? err,
      );
      return "";
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    try {
      const mammoth: any = await import("mammoth");
      const extractor = mammoth.default?.extractRawText ?? mammoth.extractRawText;
      const result = await extractor({ path: filePath });
      const text = typeof result?.value === "string" ? result.value : "";
      console.log(
        `[resumeParser] DOCX extracted ${text.length} chars from ${path.basename(filePath)}`,
      );
      return text;
    } catch (err) {
      console.error(
        `[resumeParser] DOCX parse failed for ${path.basename(filePath)}:`,
        (err as Error)?.stack ?? err,
      );
      return "";
    }
  }

  if (mimeType === "application/msword" || ext === ".doc") {
    return buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ").trim();
  }

  return buffer.toString("utf-8");
}

export function extractEmailFromText(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0];
}

export function extractPhoneFromText(text: string): string | undefined {
  const match = text.match(/(\+?[\d\s\-().]{10,})/);
  return match?.[0]?.trim();
}

export function extractLinkedInUrl(text: string): string | undefined {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)\/?/i,
  );
  if (!match) return undefined;
  return `https://www.linkedin.com/in/${match[1]}`;
}

export function extractNameFromFilename(filename: string): string {
  const raw = path
    .basename(filename, path.extname(filename))
    .replace(/[-_]/g, " ")
    .replace(/resume|cv/gi, "")
    .trim();

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  for (let size = Math.min(2, words.length - 1); size >= 1; size--) {
    const tail = words.slice(-size).join(" ");
    if (JOB_TITLE_LINE.test(tail)) {
      words.splice(-size, size);
      break;
    }
  }

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

/** Lines that look like job titles / summaries — not a person's name */
const JOB_TITLE_LINE =
  /\b(analyst|engineer|manager|developer|consultant|specialist|director|lead(?:er(?:ship)?)?|officer|associate|coordinator|architect|scientist|designer|administrator|executive|intern|graduate|trainee|business\s+analyst|project\s+manager|product\s+owner|scrum\s+master|data\s+scientist|software|full[\s-]?stack|devops|erp|sap|workday|results[\s-]?driven|transformation|innovation|head|chief|principal|founder|owner|president|evangelist|advisor|champion|technician|programmer|professor|researcher|writer|editor|expert)\b/i;

const NOISE_HEADER =
  /^(curriculum vitae|resume|cv|profile|personal details|contact|summary|objective|professional summary|experience|education|skills|work experience)\s*:?$/i;

const SECTION_HEADING =
  /^(curriculum vitae|resume|cv|profile|personal details|contact|summary|objective|professional summary|experience|education|skills|work experience|employment history|work history|core skills|key skills|executive summary|business impact|key deliverables|strategic projects|tech stack|project experience|domain)\s*:?$/i;

const BODY_SECTION_HEADING =
  /^(summary|professional summary|executive summary|experience|work experience|employment history|work history|education|core skills|key skills|business impact|key deliverables|strategic projects|tech stack|project experience|domain)\s*:?$/i;

const HEADER_DIVIDER = /\s*[|│•·]\s*/;

function stripTrailingNameDecorators(line: string): string {
  let cleaned = line.trim();
  cleaned = cleaned.replace(/\s*\([^)]{0,220}\)\s*$/u, "").trim();
  cleaned = cleaned.replace(/[,:;]+$/g, "").trim();

  const commaParts = cleaned.split(/\s*,\s*/).filter(Boolean);
  if (commaParts.length <= 1) return cleaned;

  const [first, ...rest] = commaParts;
  const looksLikeCertList = rest.every((part) =>
    /^(?:[A-Z]{2,6}|[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})$/.test(part),
  );
  return looksLikeCertList ? first.trim() : cleaned;
}

function normalizeNameCandidate(rawLine: string): string {
  let line = rawLine.trim();
  if (!line) return "";

  // Some DOCX exports glue a lowercase email local-part directly onto the last
  // name token, e.g. "Lau Pek Huongynthea@hotmail.com". Preserve the trailing
  // capitalized name fragment before removing the email address.
  line = line.replace(
    /([A-Z][a-z]{2,})([a-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "$1 ",
  );
  line = line.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g, " ");
  line = line.replace(/\+\d[\d\s().-]{8,}/g, " ");
  line = line.split(HEADER_DIVIDER)[0] ?? line;
  line = stripTrailingNameDecorators(line);
  line = line.replace(/^[-–•\s]+/, "").trim();
  line = line.replace(/\s+/g, " ").trim();
  return line;
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function titleCaseNameWord(w: string): string {
  if (/^[A-Z]{1,2}$/.test(w)) return w;
  if (/^[A-Z]{3,}$/.test(w)) return w.charAt(0) + w.slice(1).toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Parse the candidate's name from the first substantive lines of resume text.
 * Handles ALL-CAPS headers like "JEAN SJ ONG" and strips trailing "(PMP, CSM)".
 */
export function extractCandidateNameFromResumeText(text: string): string | undefined {
  const head = text.slice(0, 2500);
  const lines = head
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const rawLine of lines.slice(0, 35)) {
    if (BODY_SECTION_HEADING.test(rawLine)) break;
    if (SECTION_HEADING.test(rawLine) || NOISE_HEADER.test(rawLine)) continue;
    if (JOB_TITLE_LINE.test(rawLine)) continue;
    let line = normalizeNameCandidate(rawLine);
    if (!line) continue;
    if (line.length > 70) continue;

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 7) continue;
    if (rawLine.includes("@") && words.some((w) => w.length >= 10)) continue;

    let ok = true;
    for (const w of words) {
      if (!/^[A-Za-z][A-Za-z.'-]*$/.test(w) && !/^[A-Z]{1,3}$/.test(w)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    return words.map(titleCaseNameWord).join(" ");
  }

  return undefined;
}

/**
 * Heuristic check for obviously corrupt extracted names.
 * Models occasionally merge the candidate's name with a job title or
 * certification (e.g. "John BusinessAnalyst", "Jane PMP"); reject those.
 */
export function isLikelyCorruptExtractedName(name: string | null | undefined): boolean {
  if (name == null || typeof name !== "string") return true;
  const n = name.trim();
  if (n.length < 3 || n.length > 90) return true;
  if (SECTION_HEADING.test(n) || NOISE_HEADER.test(n)) return true;
  if (JOB_TITLE_LINE.test(n)) return true;
  const parts = n.split(/\s+/);
  // A real name word is rarely longer than 18 characters; longer tokens are
  // usually concatenated job titles or acronyms accidentally glued to the name.
  if (parts.some((p) => p.length > 18)) return true;
  // Reject names where any single word contains 4+ uppercase letters in a row
  // (typically a certification acronym pretending to be a surname).
  if (/[A-Z]{4,}/.test(n)) return true;
  return false;
}

export function resolveCandidateDisplayName(opts: {
  override?: string | null;
  aiFullName: string | null;
  resumeText: string;
  filename: string;
}): string {
  const o = opts.override?.trim();
  if (o) return o;

  const fromHeader = extractCandidateNameFromResumeText(opts.resumeText);
  if (fromHeader && !isLikelyCorruptExtractedName(fromHeader)) return fromHeader;

  const ai = opts.aiFullName?.trim() || null;
  if (ai && !isLikelyCorruptExtractedName(ai)) return ai;

  const fromFile = extractNameFromFilename(opts.filename);
  if (fromFile && fromFile.length > 2 && !/^resume$/i.test(fromFile)) return fromFile;

  return "Unknown Candidate";
}

export function sanitizeExtractedSkills(
  skills: string[] | null | undefined,
  candidateName?: string | null,
): string[] {
  if (!Array.isArray(skills)) return [];

  const normalizedCandidateName = candidateName
    ? normalizeComparableText(candidateName)
    : "";
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const rawSkill of skills) {
    if (typeof rawSkill !== "string") continue;

    const skill = rawSkill.trim();
    if (!skill) continue;
    if (SECTION_HEADING.test(skill) || NOISE_HEADER.test(skill)) continue;

    const normalizedSkill = normalizeComparableText(skill);
    if (!normalizedSkill) continue;
    if (normalizedCandidateName && normalizedSkill === normalizedCandidateName) continue;
    if (seen.has(normalizedSkill)) continue;

    seen.add(normalizedSkill);
    cleaned.push(skill);
  }

  return cleaned;
}
