# Targeted Interview Question Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR add an optional free-form focus hint and uncheck question types when generating interview questions, and tighten the underlying prompt so the model produces grounded, candidate-specific questions instead of generic textbook ones.

**Architecture:** Add request-body parameters (`focus`, `types`) to the existing `POST /ai/interview-questions/{candidateId}/{jobId}` endpoint via OpenAPI → orval regenerates the React Query hook + zod schemas. Extract a pure prompt builder so prompt logic is unit-testable without mocking the LLM. UI gets a small form (textarea + 4 checkboxes) above the existing Generate button on the candidate profile page.

**Tech Stack:** TypeScript, Express + Prisma (api-server), React + react-query (hr-platform), OpenAI SDK (gpt-4o), orval (codegen from OpenAPI), `node:test` for unit tests.

---

## Spec

`docs/superpowers/specs/2026-04-23-targeted-interview-question-generation-design.md`

## File Structure

| Path | Role |
|------|------|
| `lib/api-spec/openapi.yaml` | Add request body schema `InterviewQuestionsBody` to the existing operation. Source of truth. |
| `lib/api-client-react/src/generated/api.ts` | **Generated** by orval. Regenerated, not hand-edited. |
| `lib/api-zod/src/generated/**/*` | **Generated** by orval. Regenerated, not hand-edited. |
| `artifacts/api-server/src/lib/aiService.ts` | Extract `buildInterviewQuestionsPrompt` (pure). Extend `generateInterviewQuestions` signature with `focus`, `types`. Tighter prompt. |
| `artifacts/api-server/src/lib/aiService.test.ts` | Add `node:test` cases for the prompt builder. |
| `artifacts/api-server/src/routes/ai.ts` | Validate `focus` + `types` in both POST handlers; pass into `resolveInterviewQuestions` → `generateInterviewQuestions`. |
| `artifacts/hr-platform/src/pages/candidates/[id].tsx` | Add focus textarea + 4 type checkboxes; submit body via the regenerated mutation hook. |

No DB migration. Schema unchanged. Existing upsert key `(candidateId, jobId, mode)` kept; last write wins.

---

### Task 1: Update OpenAPI spec — add request body to interview-questions operation

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (operation at line 590, schemas section near line 1540)

- [ ] **Step 1: Add `requestBody` to the operation**

In `lib/api-spec/openapi.yaml`, find the operation at line 590 (`/ai/interview-questions/{candidateId}/{jobId}: post:`). After the `parameters:` block (ending around line 605) and before `responses:` (line 606), insert:

```yaml
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/InterviewQuestionsBody"
```

- [ ] **Step 2: Add the new schema definition**

In the same file, in the `components: schemas:` section, immediately before `InterviewQuestionsResponse:` (line 1540), add:

```yaml
    InterviewQuestionsBody:
      type: object
      properties:
        mode:
          type: string
          enum: [standard, deep]
          description: Screening cache slot (existing)
        focus:
          type: string
          maxLength: 500
          description: Optional free-form focus area, e.g. "AWS migration experience"
        types:
          type: array
          minItems: 1
          maxItems: 4
          items:
            type: string
            enum: [technical, behavioral, roleSpecific, followUp]
          description: Question categories to generate. Defaults to all four when omitted.
        force:
          type: boolean
          description: Bypass cache and regenerate.
```

- [ ] **Step 3: Regenerate clients**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: prints orval output, no errors. Files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` are rewritten.

- [ ] **Step 4: Verify regeneration produced expected mutation signature**

Run: `grep -n "generateInterviewQuestions" lib/api-client-react/src/generated/api.ts | head`
Expected: at least one match for `generateInterviewQuestions = async (` showing it now accepts an `InterviewQuestionsBody` parameter (orval derives the body name from the schema). Eyeball the updated function — its first arg should reference `InterviewQuestionsBody`.

- [ ] **Step 5: Typecheck workspace libs**

Run: `pnpm typecheck:libs`
Expected: PASS. (Existing call sites that omit the new optional body will not break because the body is `required: false`.)

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated
git commit -m "feat(api-spec): add focus/types body to interview questions endpoint"
```

---

### Task 2: Extract pure prompt builder + write failing tests

**Files:**
- Modify: `artifacts/api-server/src/lib/aiService.ts:782-836`
- Modify: `artifacts/api-server/src/lib/aiService.test.ts`

- [ ] **Step 1: Write failing tests for the new prompt builder**

Append to `artifacts/api-server/src/lib/aiService.test.ts`:

```ts
import { buildInterviewQuestionsPrompt } from "./aiService.js";

const IQ_BASE = {
  candidateName: "Jane Doe",
  resumeText: "Led AWS migration at Acme Corp 2022-2024. Owned RDS, EKS, S3.",
  skills: ["TypeScript", "AWS", "Kubernetes"],
  missingSkills: ["Terraform"],
  jobTitle: "Senior Platform Engineer",
  seniority: "senior",
  jobDescription: "Build internal developer platform.",
  responsibilities: "Own CI/CD. Operate Kubernetes clusters.",
  qualifications: "5+ years platform engineering.",
  requiredSkills: ["Kubernetes", "Terraform"],
  preferredSkills: ["AWS"],
  department: "Engineering",
};

test("prompt builder defaults to all four types and includes per-type counts", () => {
  const { prompt, types } = buildInterviewQuestionsPrompt(IQ_BASE);
  assert.deepEqual(types, ["technical", "behavioral", "roleSpecific", "followUp"]);
  assert.match(prompt, /"technical":/);
  assert.match(prompt, /"behavioral":/);
  assert.match(prompt, /"roleSpecific":/);
  assert.match(prompt, /"followUp":/);
});

test("prompt builder respects requested type subset", () => {
  const { prompt, types } = buildInterviewQuestionsPrompt({
    ...IQ_BASE,
    types: ["technical", "followUp"],
  });
  assert.deepEqual(types, ["technical", "followUp"]);
  assert.match(prompt, /"technical":/);
  assert.match(prompt, /"followUp":/);
  assert.doesNotMatch(prompt, /"behavioral":/);
  assert.doesNotMatch(prompt, /"roleSpecific":/);
});

test("prompt builder includes the focus block when focus is provided", () => {
  const { prompt } = buildInterviewQuestionsPrompt({
    ...IQ_BASE,
    focus: "AWS migration scenarios",
  });
  assert.match(prompt, /PRIMARY FOCUS/);
  assert.match(prompt, /AWS migration scenarios/);
});

test("prompt builder omits the focus block when focus is empty/whitespace", () => {
  const { prompt: p1 } = buildInterviewQuestionsPrompt({ ...IQ_BASE, focus: "" });
  const { prompt: p2 } = buildInterviewQuestionsPrompt({ ...IQ_BASE, focus: "   " });
  assert.doesNotMatch(p1, /PRIMARY FOCUS/);
  assert.doesNotMatch(p2, /PRIMARY FOCUS/);
});

test("prompt builder always includes anti-pattern and grounding rules", () => {
  const { prompt } = buildInterviewQuestionsPrompt(IQ_BASE);
  assert.match(prompt, /Avoid generic questions/i);
  assert.match(prompt, /Tell me about a time you faced a challenge/);
  assert.match(prompt, /reference at least one specific item/i);
});

test("single-type request asks for the redistributed count", () => {
  const { prompt } = buildInterviewQuestionsPrompt({
    ...IQ_BASE,
    types: ["technical"],
  });
  // 1 type → 12-15 questions
  assert.match(prompt, /12-15/);
});

test("invalid types in the array are filtered (defensive)", () => {
  const { types } = buildInterviewQuestionsPrompt({
    ...IQ_BASE,
    types: ["technical", "bogus" as any, "behavioral"],
  });
  assert.deepEqual(types, ["technical", "behavioral"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd artifacts/api-server && node --import tsx --test src/lib/aiService.test.ts`
Expected: FAIL — the new tests fail with `buildInterviewQuestionsPrompt is not exported` (or similar import error). Existing `screeningCacheKey` tests still pass.

- [ ] **Step 3: Implement the prompt builder**

In `artifacts/api-server/src/lib/aiService.ts`, **replace** the body of `generateInterviewQuestions` (currently lines 782-864) with the following two definitions. Keep the file's existing imports and helpers (`clipResume`, `QUESTIONS_RESUME_CAP`, `callOpenAIJson`, `OPENAI_MODEL`, `QUESTIONS_MAX_TOKENS`, `GENERAL_TEMPERATURE`, `asStringArray`) untouched.

```ts
export type InterviewQuestionType =
  | "technical"
  | "behavioral"
  | "roleSpecific"
  | "followUp";

const ALL_QUESTION_TYPES: readonly InterviewQuestionType[] = [
  "technical",
  "behavioral",
  "roleSpecific",
  "followUp",
] as const;

interface InterviewQuestionsOutput {
  technical: string[];
  behavioral: string[];
  roleSpecific: string[];
  followUp: string[];
}

interface InterviewQuestionsInput {
  candidateName: string;
  resumeText: string;
  skills: string[];
  missingSkills: string[];
  jobTitle: string;
  seniority: string;
  jobDescription: string;
  responsibilities?: string;
  qualifications?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  department?: string;
  focus?: string;
  types?: InterviewQuestionType[];
}

const COUNT_BY_TYPE_AND_SELECTION: Record<
  number,
  Partial<Record<InterviewQuestionType, string>>
> = {
  4: {
    technical: "5-6",
    behavioral: "4-5",
    roleSpecific: "4-5",
    followUp: "3-4",
  },
  3: {
    technical: "5-6",
    behavioral: "5-6",
    roleSpecific: "5-6",
    followUp: "5-6",
  },
  2: {
    technical: "8-9",
    behavioral: "8-9",
    roleSpecific: "8-9",
    followUp: "8-9",
  },
  1: {
    technical: "12-15",
    behavioral: "12-15",
    roleSpecific: "12-15",
    followUp: "12-15",
  },
};

const TYPE_DESCRIPTIONS: Record<InterviewQuestionType, string> = {
  technical: "job-scoped technical questions probing required/preferred skills",
  behavioral: "STAR-method questions aligned to seniority and competencies",
  roleSpecific:
    "scenario questions drawn directly from the responsibilities/JD",
  followUp:
    "probing questions targeting this candidate's specific skill gaps and resume claims",
};

export function buildInterviewQuestionsPrompt(opts: InterviewQuestionsInput): {
  prompt: string;
  types: InterviewQuestionType[];
} {
  const requestedRaw = opts.types ?? [...ALL_QUESTION_TYPES];
  const types = requestedRaw.filter((t): t is InterviewQuestionType =>
    (ALL_QUESTION_TYPES as readonly string[]).includes(t),
  );
  const selected = types.length === 0 ? [...ALL_QUESTION_TYPES] : types;

  const counts = COUNT_BY_TYPE_AND_SELECTION[selected.length] ?? {};
  const requiredSkills = (opts.requiredSkills ?? []).join(", ") || "n/a";
  const preferredSkills = (opts.preferredSkills ?? []).join(", ") || "n/a";
  const responsibilities = (opts.responsibilities ?? "").trim() || "n/a";
  const qualifications = (opts.qualifications ?? "").trim() || "n/a";
  const department = opts.department?.trim() || "n/a";
  const focus = opts.focus?.trim() ?? "";

  const focusBlock = focus
    ? `\n=== PRIMARY FOCUS ===\nAll questions must center on or probe: "${focus}".\nOther JD topics are secondary; allocate at most 25% of questions to non-focus areas.\n`
    : "";

  const outputShape = selected
    .map((t) => `  "${t}": [<${counts[t] ?? "4-5"} ${TYPE_DESCRIPTIONS[t]}>]`)
    .join(",\n");

  const prompt = `You are interviewing ${opts.candidateName} for a ${opts.seniority} ${opts.jobTitle} role. Generate interview questions tightly grounded in THIS candidate's resume and THIS job's spec — not generic textbook questions.
${focusBlock}
=== JOB ===
Title: ${opts.jobTitle}
Seniority: ${opts.seniority}
Department: ${department}
Required Skills: ${requiredSkills}
Preferred Skills: ${preferredSkills}
Responsibilities:
${responsibilities.substring(0, 1500)}
Qualifications:
${qualifications.substring(0, 1000)}
Job Description:
${(opts.jobDescription ?? "").substring(0, 1200)}

=== CANDIDATE ===
Name: ${opts.candidateName}
Skills on resume: ${(opts.skills ?? []).join(", ") || "n/a"}
Skill gaps vs job: ${(opts.missingSkills ?? []).join(", ") || "none"}
Resume excerpt:
${clipResume(opts.resumeText, QUESTIONS_RESUME_CAP)}

=== RULES ===
- Every question must reference at least one specific item by name from the resume (a project, employer, technology, claim) OR the JD (a responsibility, requirement, skill gap). No abstract phrasing.
- Avoid generic questions like: "Tell me about a time you faced a challenge", "What are your strengths", "Where do you see yourself in 5 years", "Describe a difficult coworker". These are banned.
- Tailored example (good): "You led the AWS migration at Acme Corp — walk me through how you sequenced the EKS cutover and what you would do differently for our Kubernetes platform here."
- Generic equivalent (bad): "Tell me about a migration project you've worked on."
- Do NOT ask about technologies, domains, or responsibilities not present in the job spec or the candidate's resume.

Return JSON with EXACTLY these keys (no others):
{
${outputShape}
}`;

  return { prompt, types: selected };
}

export async function generateInterviewQuestions(
  opts: InterviewQuestionsInput,
): Promise<InterviewQuestionsOutput> {
  const { prompt, types: selected } = buildInterviewQuestionsPrompt(opts);

  const fallback: InterviewQuestionsOutput = {
    technical: [],
    behavioral: [],
    roleSpecific: [],
    followUp: [],
  };

  const result = await callOpenAIJson<any>(
    "generateInterviewQuestions",
    {
      model: OPENAI_MODEL,
      max_completion_tokens: QUESTIONS_MAX_TOKENS,
      temperature: GENERAL_TEMPERATURE,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    },
    null,
  );

  if (!result) return fallback;

  const out: InterviewQuestionsOutput = { ...fallback };
  for (const t of selected) {
    out[t] = asStringArray(result[t]);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd artifacts/api-server && node --import tsx --test src/lib/aiService.test.ts`
Expected: PASS — all original tests still pass and the 7 new prompt-builder tests pass.

- [ ] **Step 5: Typecheck the api-server package**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/aiService.ts artifacts/api-server/src/lib/aiService.test.ts
git commit -m "feat(ai): grounded interview question prompt + focus/types options"
```

---

### Task 3: Wire focus + types through the API route

**Files:**
- Modify: `artifacts/api-server/src/routes/ai.ts:780-959`

- [ ] **Step 1: Extend `resolveInterviewQuestions` signature and pass new options into the LLM call**

In `artifacts/api-server/src/routes/ai.ts`, replace the function header at line 780-784 with:

```ts
async function resolveInterviewQuestions(
  candidateId: string,
  jobId: string,
  opts: {
    mode?: ScreeningMode;
    force?: boolean;
    focus?: string;
    types?: ("technical" | "behavioral" | "roleSpecific" | "followUp")[];
  } = {},
) {
```

Then in the same function, replace the call to `generateInterviewQuestions(...)` (currently at line 847) with:

```ts
  const generated = await generateInterviewQuestions({
    candidateName: candidate.fullName,
    resumeText: resume?.parsedText ?? candidate.experienceSummary ?? "",
    skills: parseList(candidate.skills),
    missingSkills: latestScreening ? parseList(latestScreening.missingSkills) : [],
    jobTitle: job.title,
    seniority: job.seniority,
    jobDescription: job.description,
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    requiredSkills: parseList(job.requiredSkills),
    preferredSkills: parseList(job.preferredSkills),
    department: job.department,
    focus: opts.focus,
    types: opts.types,
  });
```

- [ ] **Step 2: Add a body parser/validator helper above the route handlers**

Just above line 904 (the `* POST /ai/interview-questions` JSDoc comment), add:

```ts
const ALLOWED_QUESTION_TYPES = [
  "technical",
  "behavioral",
  "roleSpecific",
  "followUp",
] as const;
type AllowedQuestionType = (typeof ALLOWED_QUESTION_TYPES)[number];

function parseInterviewQuestionsBody(body: any): {
  focus?: string;
  types?: AllowedQuestionType[];
  error?: string;
} {
  const out: { focus?: string; types?: AllowedQuestionType[] } = {};
  if (body == null) return out;

  if ("focus" in body && body.focus != null) {
    if (typeof body.focus !== "string") return { error: "focus must be a string" };
    const trimmed = body.focus.trim();
    if (trimmed.length > 500) return { error: "focus must be 500 chars or fewer" };
    if (trimmed.length > 0) out.focus = trimmed;
  }

  if ("types" in body && body.types != null) {
    if (!Array.isArray(body.types)) return { error: "types must be an array" };
    if (body.types.length === 0) return { error: "types must include at least one value" };
    const filtered: AllowedQuestionType[] = [];
    for (const t of body.types) {
      if (typeof t !== "string" || !(ALLOWED_QUESTION_TYPES as readonly string[]).includes(t)) {
        return { error: `unknown question type: ${String(t)}` };
      }
      if (!filtered.includes(t as AllowedQuestionType)) filtered.push(t as AllowedQuestionType);
    }
    out.types = filtered;
  }

  return out;
}
```

- [ ] **Step 3: Use the validator in both POST handlers**

In `artifacts/api-server/src/routes/ai.ts`:

**Body-style handler** at line 908-933 — replace its body with:

```ts
router.post("/interview-questions", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId, mode, force } = req.body ?? {};
    if (!candidateId || typeof candidateId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    }
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "jobId is required" });
    }

    const parsed = parseInterviewQuestionsBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: "Bad Request", message: parsed.error });
    }

    const out = await resolveInterviewQuestions(candidateId, jobId, {
      mode: parseScreeningMode(mode),
      force: parseBooleanFlag(force),
      focus: parsed.focus,
      types: parsed.types,
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }
    res.json(out);
  } catch (err) {
    console.error("Interview questions error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Interview question generation failed" });
  }
});
```

**Path-param handler** at line 938-959 — replace its body with:

```ts
router.post("/interview-questions/:candidateId/:jobId", requireAuth, async (req, res) => {
  try {
    const { candidateId, jobId } = req.params as Record<string, string>;
    if (!candidateId) return res.status(400).json({ error: "Bad Request", message: "candidateId is required" });
    if (!jobId) return res.status(400).json({ error: "Bad Request", message: "jobId is required" });

    const parsed = parseInterviewQuestionsBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: "Bad Request", message: parsed.error });
    }

    const out = await resolveInterviewQuestions(candidateId, jobId, {
      mode: parseScreeningMode(req.body?.mode ?? req.query?.mode),
      force: parseBooleanFlag(req.body?.force ?? req.query?.force),
      focus: parsed.focus,
      types: parsed.types,
    });
    if ("error" in out) {
      if (out.error === "candidate_not_found") {
        return res.status(404).json({ error: "Not Found", message: "Candidate not found" });
      }
      return res.status(404).json({ error: "Not Found", message: "Job not found" });
    }
    res.json(out);
  } catch (err) {
    console.error("Interview questions error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Interview question generation failed" });
  }
});
```

- [ ] **Step 4: Typecheck the api-server package**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 5: Smoke-test the route handlers locally (optional but recommended)**

Run: `pnpm --filter @workspace/api-server dev` in one terminal. In another:

```bash
curl -i -X POST http://localhost:5000/api/ai/interview-questions/<candidateId>/<jobId> \
  -H "Content-Type: application/json" \
  -H "Cookie: <session cookie from a logged-in browser session>" \
  -d '{"focus":"AWS migration","types":["technical","followUp"],"force":true}'
```

Expected: HTTP 200 with `questions.technical` and `questions.followUp` populated, `questions.behavioral` and `questions.roleSpecific` as empty arrays. Stop the dev server when done.

If you don't have a candidate/job/session cookie handy, also smoke-test validation:

```bash
curl -i -X POST http://localhost:5000/api/ai/interview-questions \
  -H "Content-Type: application/json" \
  -d '{"candidateId":"x","jobId":"y","types":[]}'
```

Expected: HTTP 401 (unauthenticated) **or** 400 with `"types must include at least one value"`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/ai.ts
git commit -m "feat(api): pass focus + types through interview-questions route"
```

---

### Task 4: Add focus textarea + type checkboxes to the candidate page

**Files:**
- Modify: `artifacts/hr-platform/src/pages/candidates/[id].tsx` (imports near line 9, state near line 54, handler at lines 210-222, JSX panel at lines 618-685)

- [ ] **Step 1: Add local state for focus + selected types**

In `artifacts/hr-platform/src/pages/candidates/[id].tsx`, find where the other `useState` hooks are declared in the component body (search for `const [activeTab, setActiveTab]`). Add immediately after the existing `useState` block for tabs/sections:

```tsx
const ALL_QUESTION_TYPES = ["technical", "behavioral", "roleSpecific", "followUp"] as const;
type QuestionType = (typeof ALL_QUESTION_TYPES)[number];

const [questionFocus, setQuestionFocus] = useState("");
const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<Set<QuestionType>>(
  () => new Set(ALL_QUESTION_TYPES),
);
```

If `ALL_QUESTION_TYPES` would shadow another import, prefix with `Q_` (e.g. `Q_ALL_TYPES`). Pick whichever name is unused in the file and use it consistently below.

- [ ] **Step 2: Update `handleGenerateQuestions` to pass body**

Replace the existing function (currently lines 210-222) with:

```tsx
const handleGenerateQuestions = async () => {
  if (!currentJobId) {
    toast.error("No job associated. Please associate a job first.");
    return;
  }
  if (selectedQuestionTypes.size === 0) {
    toast.error("Select at least one question type.");
    return;
  }
  try {
    const result = await generateQuestions({
      candidateId,
      jobId: currentJobId,
      data: {
        focus: questionFocus.trim() || undefined,
        types: Array.from(selectedQuestionTypes),
      },
    });
    setInterviewQuestions(result.questions);
    toast.success("Interview questions generated!");
  } catch {
    toast.error("Failed to generate questions.");
  }
};
```

Note: the exact mutation argument shape (`data` vs `interviewQuestionsBody`) depends on the orval output verified in Task 1 Step 4. If the regenerated mutation expects a differently named property, use that name instead of `data` here. Confirm by re-reading the regenerated `useGenerateInterviewQuestions` signature in `lib/api-client-react/src/generated/api.ts` before writing this code.

- [ ] **Step 3: Add the form (textarea + checkboxes) above the existing Generate button**

In the same file, find the `activeTab === "questions"` panel (line 618). Replace the header div (lines 620-638) with:

```tsx
<div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-4">
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div className="min-w-0">
      <h4 className="font-bold text-indigo-900">AI-Generated Interview Questions</h4>
      <p className="text-sm text-indigo-600 mt-0.5">
        {currentJobId
          ? `Tailored for ${currentJobTitle ?? "the associated job"}`
          : "Associate a job to generate tailored questions"}
      </p>
    </div>
  </div>

  <div>
    <label htmlFor="question-focus" className="block text-xs font-semibold text-indigo-900 mb-1">
      Focus area (optional)
    </label>
    <textarea
      id="question-focus"
      rows={2}
      maxLength={500}
      value={questionFocus}
      onChange={(e) => setQuestionFocus(e.target.value)}
      placeholder="e.g. 'AWS migration scenarios', 'leading distributed teams', 'debugging production incidents'"
      className="w-full p-3 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-400"
    />
    {questionFocus.length > 400 && (
      <p className="text-xs text-slate-500 mt-1">{questionFocus.length}/500 characters</p>
    )}
  </div>

  <div>
    <p className="block text-xs font-semibold text-indigo-900 mb-2">Question types</p>
    <div className="flex flex-wrap gap-3">
      {([
        { key: "technical", label: "Technical" },
        { key: "behavioral", label: "Behavioral" },
        { key: "roleSpecific", label: "Role-Specific" },
        { key: "followUp", label: "Follow-Up" },
      ] as const).map(({ key, label }) => {
        const checked = selectedQuestionTypes.has(key);
        return (
          <label key={key} className="flex items-center gap-2 text-sm text-indigo-900 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                setSelectedQuestionTypes((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(key);
                  else next.delete(key);
                  return next;
                });
              }}
              className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            {label}
          </label>
        );
      })}
    </div>
  </div>

  <div className="flex justify-end">
    <button
      onClick={handleGenerateQuestions}
      disabled={isGeneratingQuestions || !currentJobId || selectedQuestionTypes.size === 0}
      title={
        !currentJobId
          ? "No job associated"
          : selectedQuestionTypes.size === 0
          ? "Select at least one question type"
          : "Generate interview questions powered by AI"
      }
      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
    >
      {isGeneratingQuestions ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
      {isGeneratingQuestions
        ? "Generating..."
        : selectedQuestionTypes.size < 4
        ? "Generate Selected Questions"
        : "Generate Questions"}
    </button>
  </div>
</div>
```

(The results section below — the `interviewQuestions ? (...) : (...)` block at lines 640-683 — is unchanged. It already hides empty type sections via `if (!questions?.length) return null;` at line 651.)

- [ ] **Step 4: Typecheck the hr-platform package**

Run: `pnpm --filter @workspace/hr-platform typecheck`
Expected: PASS.

- [ ] **Step 5: Manual UI test**

Run: `pnpm dev` (starts both api-server and hr-platform).

In the browser:
1. Open a candidate that has a resume + associated job: `/candidates/<id>`.
2. Click the "Interview Qs" tab.
3. Verify all 4 checkboxes are checked, focus textarea is empty, button reads "Generate Questions".
4. Uncheck "Behavioral" and "Role-Specific". Verify button reads "Generate Selected Questions".
5. Type a focus like `AWS migration scenarios` in the textarea.
6. Click the button. Wait for the result.
7. Confirm only Technical and Follow-Up sections appear in the results.
8. Confirm questions reference AWS / migration / specific resume items by name (no generic "tell me about a time" phrasing).
9. Uncheck all 4 — confirm button is disabled and shows the tooltip.

Stop the dev server when done. If any of 3-9 fails, treat it as a bug and fix in this task before committing.

- [ ] **Step 6: Commit**

```bash
git add artifacts/hr-platform/src/pages/candidates/[id].tsx
git commit -m "feat(ui): focus + type selector for interview question generation"
```

---

### Task 5: Final workspace typecheck + summary

- [ ] **Step 1: Run full workspace typecheck**

Run: `pnpm typecheck`
Expected: PASS across libs and artifacts.

- [ ] **Step 2: Re-run unit tests**

Run: `cd artifacts/api-server && node --import tsx --test src/lib/aiService.test.ts`
Expected: PASS — all original + 7 new prompt-builder tests.

- [ ] **Step 3: Verify spec was honored**

Eyeball the spec at `docs/superpowers/specs/2026-04-23-targeted-interview-question-generation-design.md`. Confirm each of these is true in the implemented code:

- Focus textarea, max 500 chars, optional, character counter past 400 chars — ✔
- 4 type checkboxes, all on by default, button disabled when 0 — ✔
- Per-type counts redistribute (4/3/2/1 → existing/5-6/8-9/12-15) — ✔ (in `COUNT_BY_TYPE_AND_SELECTION`)
- Anti-pattern + grounding rules + few-shot example always in prompt — ✔
- Focus block injected only when non-empty — ✔
- Type filtering: dynamic output schema + only requested keys parsed — ✔
- DB schema unchanged, last-write-wins upsert preserved — ✔
- API zod-style validation rejects oversize focus / empty types / unknown type values — ✔ (manual validator in route)

If anything is missing, fix it before declaring done.
