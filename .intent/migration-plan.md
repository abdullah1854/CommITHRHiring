# Legacy AIHRHiring migration/deprecation plan

Kanban task: `t_bc436da5`

## Scope

Compare the legacy project expected at `~/HR/AIHRHiring` with the current `CommITHRHiring` repository and identify:

- files/features that exist only in the legacy project,
- drift risks between the legacy and current implementations,
- a safe migration/deprecation recommendation.

This is intentionally a non-destructive plan. Do not delete, archive, or consolidate any legacy files until Abdullah reviews and approves the recommendation.

## Current repository baseline

Current `CommITHRHiring` is a TypeScript pnpm monorepo for COMM-iT Group's AI-assisted hiring workflow.

Observed baseline from this repository:

- Frontend: `artifacts/hr-platform`, React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/Radix UI, React Query, Wouter.
- API: `artifacts/api-server`, Express 5, TypeScript, Prisma Client, Supabase SDK, OpenAI-backed AI services, optional Apify and SMTP integrations.
- Data model: `lib/db/prisma/schema.prisma`, scoped to Supabase Postgres schema `commit_hr`.
- API contract: `lib/api-spec/openapi.yaml`, with generated clients/schemas under `lib/api-client-react` and `lib/api-zod`.
- Deployment: Railway two-service model using `railway.api-server.json` and `railway.hr-platform.json`.
- Existing product surface includes public careers/job detail pages, recruiter/admin auth, jobs, candidates, applications, resumes, interviews, notifications, analytics, AI job description generation, resume parsing, candidate summaries/ranking, and standard/deep screening.

## Legacy project lookup result

The expected legacy project was not present in this worker environment.

Checked locations:

- `/opt/data/profiles/analyst/home/HR/AIHRHiring` — missing
- `/opt/data/home/HR/AIHRHiring` — missing
- `/opt/data/home/github/AIHRHiring` — missing
- `/opt/data/home/github/CommITHRHiring/../AIHRHiring` — missing

A bounded directory-name scan under `/opt/data/home`, `/opt/data/profiles`, and `/opt/data` also found no directory whose basename contains `AIHRHiring`.

Because the legacy tree is unavailable, this plan cannot honestly claim a file-by-file diff or identify concrete legacy-only files. The migration status below is therefore evidence-limited: it documents the current repository baseline and the risks created by the missing legacy source.

## Legacy-only files/features

No concrete legacy-only files could be identified because the legacy repository/path is absent from the environment.

Feature areas that must be checked if the legacy tree is restored:

1. Authentication and user-role behaviour
   - Compare recruiter/admin role semantics, invite/onboarding flows, session/cookie handling, and Supabase Auth assumptions.
2. Job lifecycle
   - Compare job statuses, template fields, public posting behaviour, and any approval workflow.
3. Candidate and application lifecycle
   - Compare status values, notes, assignment/ownership, duplicate handling, and candidate-to-job linking.
4. Resume ingestion
   - Compare accepted file types, upload storage location, parsing quality, deduplication, `fileSha256` behaviour, and fallback handling for parse failures.
5. AI workflows
   - Compare job description generation, candidate summaries, ranking, interview question generation, standard/deep screening, prompt versions, score ranges, caching, and provider/model configuration.
6. Analytics and reporting
   - Compare dashboard metrics, funnel calculations, date filtering, export/report features, and any executive reporting views.
7. Notifications and email
   - Compare SMTP/email templates, notification triggers, retry/failure behaviour, and candidate-facing communications.
8. Integrations
   - Compare LinkedIn/Apify enrichment, external ATS imports/exports, webhook endpoints, and any one-off scripts.
9. Deployment and operations
   - Compare environment variables, Railway/Replit/PM2 scripts, health endpoints, seed scripts, backup scripts, and production runbooks.
10. Data schema and migrations
    - Compare table names, enum/status values, required fields, indexes, unique constraints, migration history, and seed/demo data.

## Drift risks

High-confidence risks caused by not having the legacy tree available:

- Hidden feature loss: legacy-only screens, scripts, prompt variants, seed data, or operational docs may be absent from `CommITHRHiring` and would be missed by a blind deprecation.
- Data-model drift: legacy status names or table shapes may differ from the current `commit_hr` Prisma schema, causing migration scripts or historical data imports to drop/transform values incorrectly.
- AI behaviour drift: prompt wording, scoring rubrics, model choices, token caps, and fallback behaviour may have changed; these can materially alter candidate rankings and screening recommendations.
- Auth/session drift: legacy deployments may rely on cookies, headers, roles, or Supabase policies not represented by the current app.
- Deployment drift: legacy env var names, service names, PM2/Replit/Railway scripts, or healthcheck expectations may still be used by live infrastructure.
- Asset/document drift: logos, uploaded examples, job templates, email templates, and attached assets may exist only in legacy.

Risks observed in the current shared repository workspace:

- The main shared worktree had unrelated uncommitted changes before this task started. This plan was therefore written in an isolated Git worktree under `.kanban-worktrees/t_bc436da5` to avoid disturbing other active work.
- The branch used for this plan is based on `origin/main`, not the dirty shared worktree.

## Recommended migration/deprecation decision

Recommendation: do not destructively consolidate or delete any legacy `AIHRHiring` source yet.

Proceed with a two-gate migration:

1. Evidence gate: Abdullah or an operator should restore/provide the legacy tree path or confirm that no legacy tree exists and that the old project has already been intentionally removed.
2. Diff gate: once the legacy tree is available, run a clean structural and semantic diff against `CommITHRHiring`, then update this file with concrete legacy-only files/features before any destructive action.

If Abdullah confirms the legacy project is intentionally gone and not recoverable, treat `CommITHRHiring` as the source of truth, but keep this plan as the audit note explaining that no file-level migration could be performed.

## Follow-up diff procedure if legacy is restored

From a clean machine/worktree where both paths exist:

```bash
LEGACY="$HOME/HR/AIHRHiring"
CURRENT="/opt/data/home/github/CommITHRHiring"

# 1. Confirm both roots exist.
test -d "$LEGACY"
test -d "$CURRENT"

# 2. Create inventories excluding generated/dependency/build folders.
python3 - <<'PY'
import os
from pathlib import Path

roots = {
    'legacy': Path(os.environ.get('LEGACY', str(Path.home() / 'HR' / 'AIHRHiring'))),
    'current': Path(os.environ.get('CURRENT', '/opt/data/home/github/CommITHRHiring')),
}
ignore = {'.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache'}
for name, root in roots.items():
    paths = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ignore]
        for f in files:
            rel = Path(dirpath, f).relative_to(root)
            paths.append(str(rel))
    Path(f'/tmp/{name}-files.txt').write_text('\n'.join(sorted(paths)) + '\n')
PY

# 3. Compare file inventories.
comm -23 /tmp/legacy-files.txt /tmp/current-files.txt > /tmp/legacy-only-files.txt
comm -13 /tmp/legacy-files.txt /tmp/current-files.txt > /tmp/current-only-files.txt

# 4. Review important implementation drift manually.
diff -ru --exclude .git --exclude node_modules --exclude dist --exclude build "$LEGACY" "$CURRENT" > /tmp/aihr-vs-commithr.diff || true
```

Then update this plan with:

- exact legacy-only file list grouped by feature area,
- migrated / intentionally dropped / still-needed classification,
- data migration notes, if schemas differ,
- final deprecation checklist.

## Destructive consolidation hold

Blocked pending Abdullah review.

No deletion, archival, branch merge, database migration, or production configuration cleanup should happen until Abdullah answers one of these:

1. Provide the correct legacy `AIHRHiring` path/repository so the diff can be completed.
2. Confirm the legacy project no longer exists and approve treating `CommITHRHiring` as the only source of truth.
3. Explicitly approve deprecating legacy without a file-level diff, accepting the feature-loss risk documented above.
