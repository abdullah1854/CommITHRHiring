import fs from "fs";
import path from "path";

/**
 * Deletes ALL candidates and dependent rows (resumes, applications, screenings,
 * interviews, AI summaries). Jobs and users are left intact.
 *
 * Run on the server with DATABASE_URL pointing at that database.
 *
 *   pnpm --filter @workspace/scripts wipe-candidates -- --yes
 *
 * Or set CONFIRM_WIPE_CANDIDATES=yes (used by automation).
 */
const argv = process.argv.slice(2);
const hasFlag = argv.includes("--yes") || argv.includes("-y");
const envOk = process.env.CONFIRM_WIPE_CANDIDATES === "yes";
if (!hasFlag && !envOk) {
  console.error(
    "Refusing to run: this permanently deletes every candidate and related data.\n" +
      "  Re-run with:  pnpm --filter @workspace/scripts wipe-candidates -- --yes\n" +
      "  Or set:       CONFIRM_WIPE_CANDIDATES=yes",
  );
  process.exit(1);
}

function loadDatabaseUrlFromRootEnv() {
  if (process.env.DATABASE_URL) return;

  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== "DATABASE_URL") continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value) {
      process.env.DATABASE_URL = value;
    }
    return;
  }
}

async function main() {
  loadDatabaseUrlFromRootEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set, or present in the repo root .env file.");
  }

  const { prisma } = await import("@workspace/db");

  console.log("Wiping candidate-related data...");

  const counts = await prisma.$transaction(async (tx) => {
    const screening = await tx.aiScreeningResult.deleteMany({});
    const interviews = await tx.interview.deleteMany({});
    const applications = await tx.application.deleteMany({});
    const resumes = await tx.resume.deleteMany({});
    const summaries = await tx.aiCandidateSummary.deleteMany({});
    const candidates = await tx.candidate.deleteMany({});
    return { screening, interviews, applications, resumes, summaries, candidates };
  });

  console.log("Done. Deleted rows:");
  console.log(`  ai_screening_results: ${counts.screening.count}`);
  console.log(`  interviews: ${counts.interviews.count}`);
  console.log(`  applications: ${counts.applications.count}`);
  console.log(`  resumes: ${counts.resumes.count}`);
  console.log(`  ai_candidate_summaries: ${counts.summaries.count}`);
  console.log(`  candidates: ${counts.candidates.count}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
