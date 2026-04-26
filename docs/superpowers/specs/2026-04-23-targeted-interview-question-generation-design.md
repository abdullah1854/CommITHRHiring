# Targeted Interview Question Generation

**Date:** 2026-04-23
**Status:** Approved, ready for implementation plan

## Problem

HR feedback: AI-generated interview questions read as generic — they could apply to any candidate in any company, instead of probing this specific candidate's resume against this specific job. Root cause is prompt quality (shallow, textbook-style questions), not missing question categories.

## Goals

1. Let HR add a free-form **focus** hint per generation so AI can target a specific area (e.g. "AWS migration experience", "leading distributed teams").
2. Let HR **uncheck question types** they don't want, so the model spends its depth budget on the selected types.
3. Tighten the underlying prompt so questions are specific and grounded in the resume / JD even when no focus is provided.

## Non-Goals (YAGNI)

- New question categories beyond the existing 4 (technical / behavioral / role-specific / follow-up).
- Per-type focus fields (one global focus field is enough for v1).
- Difficulty / seniority overrides — already inferred from `job.seniority`.
- History of past generations — current upsert (last write wins) stays.
- Persisting the focus string in DB (cosmetic; deferred).

## Affected Surfaces

| Layer | File | Change |
|-------|------|--------|
| UI | `artifacts/hr-platform/src/pages/candidates/[id].tsx` | Add focus textarea + 4 type checkboxes above Generate button. Hide empty type sections in results. |
| API client | `lib/api-client-react/...` (existing `useGenerateInterviewQuestions` hook) | Forward `focus` and `types` in mutation body. |
| API route | `artifacts/api-server/src/routes/ai.ts` | Extend POST body schema, validate, pass through. |
| AI service | `artifacts/api-server/src/lib/aiService.ts` | Accept `focus`, `types`. Rework prompt. Build dynamic output schema. |
| DB | `lib/db/prisma/schema.prisma` | No change. Unselected types stored as `"[]"`. |

## Detailed Design

### 1. UI (`candidates/[id].tsx`)

Inside the `activeTab === "questions"` panel, replace the bare "Generate Questions" button with a small form:

- **Focus input** — `<textarea rows={2} maxLength={500}>`, placeholder: `"Optional: focus area, e.g. 'AWS migration scenarios', 'leading distributed teams', 'debugging production incidents'"`. Empty by default. Character counter shown when >400 chars.
- **Type checkboxes** — 4 checkboxes labeled Technical, Behavioral, Role-Specific, Follow-Up. All checked by default. Stored in local state `selectedTypes: Set<string>`.
- **Generate button** —
  - Label: "Generate Questions" if all 4 selected, else "Generate Selected Questions".
  - Disabled when `selectedTypes.size === 0`.
- On submit, call `useGenerateInterviewQuestions` with `{ focus, types: Array.from(selectedTypes) }`.
- **Results rendering:** the 4 collapsible sections (lines 641-684) only render if their array is non-empty. So unchecked types simply don't appear.
- **Cache hydration on mount:** existing GET still loads last cached set as-is. Form fields reset to defaults (all checked, focus empty) on each page load — we do not try to restore the params used for the last generation.

### 2. API route (`routes/ai.ts`)

Extend the existing zod body schema for `POST /api/ai/interview-questions/:candidateId/:jobId`:

```ts
const TYPES = ["technical", "behavioral", "roleSpecific", "followUp"] as const;

const body = z.object({
  mode: z.string().optional(),                // existing
  focus: z.string().trim().max(500).optional(),
  types: z.array(z.enum(TYPES)).min(1).optional()  // default = all 4
});
```

Pass both new fields into `generateInterviewQuestions`. Cache key (`candidateId, jobId, mode`) unchanged — last write wins.

### 3. `aiService.generateInterviewQuestions`

**Signature change:**

```ts
type QType = "technical" | "behavioral" | "roleSpecific" | "followUp";

async function generateInterviewQuestions(input: {
  // existing fields...
  focus?: string;
  types?: QType[];          // defaults to all 4
}): Promise<Record<QType, string[]>>
```

**Prompt rework (applies regardless of focus):**

- Drop the abstract "you are an expert interviewer" boilerplate; replace with a concrete role statement that names the candidate, job title, and seniority.
- Add an **anti-pattern block** listing examples of generic questions to avoid:
  > "Avoid generic questions like: 'Tell me about a time you faced a challenge', 'What are your strengths', 'Where do you see yourself in 5 years', 'Describe a difficult coworker'. These are banned."
- Add a **grounding rule**: every question must reference at least one specific item from the resume (a project, employer, technology) OR the JD (a responsibility, requirement, skill gap) by name. No abstract phrasing.
- Add **one short few-shot example** showing a tailored question vs. its generic equivalent for the same input.

**Focus injection (when `focus` non-empty):**

Prepend a dedicated instruction block:

```
PRIMARY FOCUS: All questions must center on or probe: "{focus}".
Other JD topics are secondary; allocate at most 25% of questions to non-focus areas.
```

**Type filtering:**

- Build the JSON output schema dynamically from the `types` array — only include keys for selected types.
- Adjust per-type counts so total stays ~16-18 questions (depth budget redistributed when fewer types selected):
  - 4 types: technical 5-6 / behavioral 4-5 / roleSpecific 4-5 / followUp 3-4 (existing counts)
  - 3 types: 5-6 each
  - 2 types: 8-9 each
  - 1 type: 12-15
- Update the system instruction to describe only the selected types.

**Persistence:** unselected types are written as empty arrays (`"[]"`) so the upsert stays simple. UI hides empty sections.

### 4. Error handling

- API: zod validation rejects `focus > 500 chars` or `types: []` with 400.
- UI: button disabled prevents empty-types submit; focus length capped client-side.
- AI service: if model returns extra type keys not requested, drop them. If model omits a requested type, store empty array (UI will show that section as empty).

### 5. Testing

- Unit: `generateInterviewQuestions` builds correct prompt blocks for: (a) no focus + all types, (b) with focus + 1 type, (c) with focus + 2 types.
- Unit: zod schema rejects oversize focus, empty types array, unknown type values.
- Manual: regenerate for an existing candidate with focus="AWS migration" + technical only → confirm questions reference AWS specifics from JD/resume; other 3 sections hidden.

## Open Questions

None at design time. Review may surface UI polish items.

## Out of Scope / Future Work

- Saving focus alongside cached set (would need `focus NVarChar(500) NULL` column on `AiInterviewQuestionSet`).
- Per-type focus fields.
- New question categories (situational, leadership, case-study).
- Letting HR edit/regenerate individual questions.
