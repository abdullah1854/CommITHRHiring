import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScreeningOutput } from "../lib/aiService.js";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/aihiring_test";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.AI_SCREEN_CACHE_DIR = mkdtempSync(join(tmpdir(), "ai-screen-cache-"));

function createScreeningOutput(matchScore: number): ScreeningOutput {
  const fitLabel: ScreeningOutput["fitLabel"] =
    matchScore >= 75 ? "strong_fit" : matchScore >= 50 ? "moderate_fit" : "weak_fit";
  return {
    matchScore,
    fitLabel,
    matchedSkills: ["TypeScript"],
    missingSkills: ["Kubernetes"],
    strengths: ["Relevant platform delivery"],
    risks: ["Needs deeper Kubernetes evidence"],
    reasoning: `Synthetic screening score ${matchScore}`,
    aiRecommendation: "second-look — synthetic test output",
    confidence: "medium",
    jobSpecQuality: "good",
    rubric: {},
    rawResponse: JSON.stringify({ computedScore: matchScore }),
  };
}

function createFakeDb() {
  const candidates = new Map<string, any>([
    [
      "11111111-1111-4111-8111-111111111111",
      {
        id: "11111111-1111-4111-8111-111111111111",
        fullName: "Parsed Name One",
        skills: JSON.stringify(["TypeScript"]),
        experienceSummary: "Built internal tools.",
        status: "new",
      },
    ],
    [
      "22222222-2222-4222-8222-222222222222",
      {
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Different Parsed Name",
        skills: JSON.stringify(["TypeScript", "Node"]),
        experienceSummary: "Built internal tools.",
        status: "new",
      },
    ],
    [
      "33333333-3333-4333-8333-333333333333",
      {
        id: "33333333-3333-4333-8333-333333333333",
        fullName: "Third Parsed Name",
        skills: JSON.stringify(["TypeScript", "Node"]),
        experienceSummary: "Built internal tools.",
        status: "new",
      },
    ],
  ]);

  const jobs = new Map<string, any>([
    [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Platform Engineer",
        description: "Build internal developer tooling.",
        responsibilities: "Own APIs and delivery workflows.",
        qualifications: "5+ years engineering experience.",
        requiredSkills: JSON.stringify(["TypeScript", "Node"]),
        preferredSkills: JSON.stringify(["Kubernetes"]),
        seniority: "senior",
        minExperience: 5,
        maxExperience: 10,
      },
    ],
    [
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Data Analyst",
        description: "Build finance dashboards and operational reports.",
        responsibilities: "Own Power BI reporting and stakeholder analysis.",
        qualifications: "3+ years analytics experience.",
        requiredSkills: JSON.stringify(["Power BI", "SQL"]),
        preferredSkills: JSON.stringify(["Finance operations"]),
        seniority: "mid",
        minExperience: 3,
        maxExperience: 7,
      },
    ],
  ]);

  const resumes = new Map<string, any>();
  for (const candidateId of candidates.keys()) {
    resumes.set(candidateId, {
      id: `resume-${candidateId}`,
      candidateId,
      parsedText: "Resume bytes describe TypeScript platform work.",
      fileSha256: "same-file-sha",
      textFingerprint: "same-normalized-text-fingerprint",
      uploadedAt: new Date(),
    });
  }

  const aiScreeningRows: any[] = [];
  const durableCache = new Map<string, any>();
  let screeningSeq = 0;

  function matches(row: any, where: Record<string, any>): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (expected && typeof expected === "object" && "not" in expected) {
        return row[key] !== expected.not;
      }
      return row[key] === expected;
    });
  }

  const db = {
    candidate: {
      findFirst: async ({ where }: any) => candidates.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const candidate = candidates.get(where.id);
        if (!candidate) throw new Error(`candidate not found: ${where.id}`);
        Object.assign(candidate, data);
        return candidate;
      },
    },
    job: {
      findFirst: async ({ where }: any) => jobs.get(where.id) ?? null,
    },
    resume: {
      findFirst: async ({ where }: any) => resumes.get(where.candidateId) ?? null,
    },
    aiScreeningResult: {
      findFirst: async ({ where }: any) =>
        [...aiScreeningRows]
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .find((row) => matches(row, where)) ?? null,
      create: async ({ data }: any) => {
        const row = {
          id: `screening-${++screeningSeq}`,
          createdAt: new Date(1_800_000_000_000 + screeningSeq),
          ...data,
        };
        aiScreeningRows.push(row);
        return row;
      },
    },
    screeningCache: {
      findUnique: async ({ where }: any) => durableCache.get(where.cacheKey) ?? null,
      findFirst: async ({ where }: any) =>
        [...durableCache.values()]
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .find((row) => matches(row, where)) ?? null,
      create: async ({ data }: any) => {
        if (durableCache.has(data.cacheKey)) {
          const err = new Error("Unique constraint failed on screening_cache.cache_key") as Error & {
            code?: string;
          };
          err.code = "P2002";
          throw err;
        }
        const row = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        durableCache.set(data.cacheKey, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const existing = durableCache.get(where.cacheKey);
        if (!existing) throw new Error(`screening cache not found: ${where.cacheKey}`);
        const row = {
          ...existing,
          ...data,
          updatedAt: new Date(),
        };
        durableCache.set(where.cacheKey, row);
        return row;
      },
    },
  };

  return {
    db,
    setResume(candidateId: string, patch: Record<string, any>) {
      const resume = resumes.get(candidateId);
      if (!resume) throw new Error(`resume not found: ${candidateId}`);
      Object.assign(resume, patch);
    },
    setJob(jobId: string, patch: Record<string, any>) {
      const job = jobs.get(jobId);
      if (!job) throw new Error(`job not found: ${jobId}`);
      Object.assign(job, patch);
    },
    deleteCandidate(candidateId: string) {
      candidates.delete(candidateId);
      for (let i = aiScreeningRows.length - 1; i >= 0; i--) {
        if (aiScreeningRows[i]?.candidateId === candidateId) aiScreeningRows.splice(i, 1);
      }
    },
  };
}

test("same normalized resume text + job + mode reuses durable score even when file bytes differ", async () => {
  const { runScreeningInternal } = await import("./ai.js");
  const fake = createFakeDb();
  fake.setResume("22222222-2222-4222-8222-222222222222", {
    fileSha256: "different-export-sha",
    textFingerprint: "same-normalized-text-fingerprint",
    parsedText: "Resume bytes describe TypeScript platform work.\n\n",
  });
  const calls: any[] = [];
  const fakeScreenCandidate = async (input: any) => {
    calls.push(input);
    return createScreeningOutput(71);
  };

  const first = await runScreeningInternal(
    "11111111-1111-4111-8111-111111111111",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );
  assert.equal("screening" in first ? first.screening.matchScore : null, 71);

  const second = await runScreeningInternal(
    "22222222-2222-4222-8222-222222222222",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );

  assert.equal("screening" in second ? second.screening.matchScore : null, 71);
  assert.equal(calls.length, 1);
  assert.equal("cached" in second ? second.cached : false, true);
  assert.equal("cacheReason" in second ? second.cacheReason : null, "normalized_resume_match");
});

test("force=true bypasses deterministic cache and persists a fresh score", async () => {
  const { runScreeningInternal } = await import("./ai.js");
  const fake = createFakeDb();
  const calls: any[] = [];
  const fakeScreenCandidate = async (input: any) => {
    calls.push(input);
    return createScreeningOutput(calls.length === 1 ? 64 : 92);
  };

  const first = await runScreeningInternal(
    "11111111-1111-4111-8111-111111111111",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );
  assert.equal("screening" in first ? first.screening.matchScore : null, 64);

  const forced = await runScreeningInternal(
    "11111111-1111-4111-8111-111111111111",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard", force: true },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );

  assert.equal("screening" in forced ? forced.screening.matchScore : null, 92);
  assert.equal(calls.length, 2);
  assert.equal("cached" in forced ? forced.cached : true, false);
  assert.equal("cacheReason" in forced ? forced.cacheReason : null, "force_rescore");
});

test("job rubric changes invalidate same resume deterministic cache", async () => {
  const { runScreeningInternal } = await import("./ai.js");
  const fake = createFakeDb();
  const calls: any[] = [];
  const fakeScreenCandidate = async (input: any) => {
    calls.push(input);
    return createScreeningOutput(calls.length === 1 ? 60 : 84);
  };

  const first = await runScreeningInternal(
    "11111111-1111-4111-8111-111111111111",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );
  assert.equal("screening" in first ? first.screening.matchScore : null, 60);

  fake.setJob("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    qualifications: "5+ years engineering experience plus production Kubernetes ownership.",
    preferredSkills: JSON.stringify(["Kubernetes", "Platform SRE"]),
  });

  const changedRubric = await runScreeningInternal(
    "22222222-2222-4222-8222-222222222222",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );

  assert.equal("screening" in changedRubric ? changedRubric.screening.matchScore : null, 84);
  assert.equal(calls.length, 2);
  assert.equal("cached" in changedRubric ? changedRubric.cached : true, false);
  assert.equal(calls[1]?.qualifications, "5+ years engineering experience plus production Kubernetes ownership.");
});

test("same file sha + job + mode reuses durable score after candidate deletion", async () => {
  const { runScreeningInternal } = await import("./ai.js");
  const fake = createFakeDb();
  const calls: any[] = [];
  const fakeScreenCandidate = async (input: any) => {
    calls.push(input);
    return createScreeningOutput(input.jobTitle === "Platform Engineer" ? 64 : 55);
  };

  const first = await runScreeningInternal(
    "11111111-1111-4111-8111-111111111111",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );
  assert.equal("screening" in first ? first.screening.matchScore : null, 64);

  fake.deleteCandidate("11111111-1111-4111-8111-111111111111");

  const second = await runScreeningInternal(
    "22222222-2222-4222-8222-222222222222",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );
  assert.equal("screening" in second ? second.screening.matchScore : null, 64);
  assert.equal(calls.length, 1);

  const differentJob = await runScreeningInternal(
    "33333333-3333-4333-8333-333333333333",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    { mode: "standard" },
    { db: fake.db, screenCandidate: fakeScreenCandidate },
  );
  assert.equal("screening" in differentJob, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.jobTitle, "Data Analyst");
});
