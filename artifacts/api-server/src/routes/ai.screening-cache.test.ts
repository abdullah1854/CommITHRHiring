import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScreeningOutput } from "../lib/aiService.js";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/aihiring_test";
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
    },
  };

  return {
    db,
    deleteCandidate(candidateId: string) {
      candidates.delete(candidateId);
      for (let i = aiScreeningRows.length - 1; i >= 0; i--) {
        if (aiScreeningRows[i]?.candidateId === candidateId) aiScreeningRows.splice(i, 1);
      }
    },
  };
}

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
