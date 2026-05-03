# CommITHRHiring

CommITHRHiring is a TypeScript monorepo for COMM-iT Group's AI-assisted hiring workflow. It combines a React recruiting dashboard, an Express REST API, Supabase Postgres/Auth/Storage integration points, and AI services for job descriptions, resume parsing, candidate screening, interview questions, and recruitment analytics.

The repository is structured for local development with pnpm workspaces and for production deployment as two Railway services: `api-server` and `hr-platform`.

## What is included

- Public careers pages and job detail pages.
- Recruiter/admin login flows backed by Supabase-aware profile data.
- Job, candidate, application, resume, interview, notification, and analytics APIs.
- AI-assisted job description generation/improvement, resume parsing, candidate summaries, candidate ranking, and standard/deep screening.
- OpenAPI-first API contracts with generated React Query client helpers and generated Zod schemas.
- Prisma models for the `commit_hr` schema in Supabase Postgres.
- Railway service configs for deploying the API and frontend from the same monorepo.

## Tech stack

| Area | Stack |
| --- | --- |
| Package management | pnpm 10 workspaces, Node.js 20.10+ |
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/Radix UI, React Query, Wouter, Recharts, Framer Motion |
| Backend | Express 5, TypeScript, tsx, esbuild bundle output |
| Database | Supabase Postgres, Prisma Client, Prisma schema scoped to `commit_hr` |
| Auth/storage | Supabase Auth and Supabase SDK integration points |
| API contracts | OpenAPI 3.1, Orval-generated React client and Zod schemas |
| AI providers | OpenAI for general AI flows; Anthropic Claude for deep screening |
| Optional integrations | Apify LinkedIn enrichment, SMTP email delivery |
| Deployment | Railway Nixpacks, two-service deployment |

## Monorepo layout

```text
.
├── artifacts/
│   ├── api-server/          # Express API, route handlers, AI services, resume parsing
│   ├── hr-platform/         # React/Vite recruiting dashboard and public careers UI
│   └── mockup-sandbox/      # Design/prototype sandbox, not part of the Railway deployment
├── lib/
│   ├── api-spec/            # OpenAPI source and Orval config
│   ├── api-client-react/    # Generated React Query API client package
│   ├── api-zod/             # Generated Zod schemas and typed API helpers
│   ├── db/                  # Prisma schema, migrations, and DB package exports
│   └── integrations*/       # Shared AI integration packages
├── scripts/                 # Utility and seed scripts
├── railway.api-server.json  # Railway config for the API service
├── railway.hr-platform.json # Railway config for the frontend service
├── RAILWAY.md               # Detailed Railway deployment runbook
└── .env.example             # Environment variable template
```

## Prerequisites

- Node.js `>=20.10.0`
- pnpm `>=10.0.0` via Corepack or a global pnpm install
- A Supabase project with the `commit_hr` schema available
- OpenAI and Anthropic API keys for production AI features
- Optional: Apify token for LinkedIn enrichment and SMTP credentials for email delivery

Enable pnpm with Corepack if needed:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## Local development setup

1. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in the required values in `.env`. See [Environment variables](#environment-variables) for the high-level list and `.env.example` for the canonical template.

4. Generate the Prisma client:

   ```bash
   pnpm --filter @workspace/db run generate
   ```

5. Apply the Prisma schema to the configured Supabase database when needed:

   ```bash
   pnpm --filter @workspace/db run push
   ```

6. Start the API and web app together:

   ```bash
   pnpm dev
   ```

   Or run them in separate terminals:

   ```bash
   pnpm --filter @workspace/api-server dev
   pnpm --filter @workspace/hr-platform dev
   ```

The API defaults to port `8080`. The Vite dev server proxies `/api/*` to `http://localhost:8080` for local development.

## Common commands

```bash
# Typecheck workspace libraries and runnable apps
pnpm run typecheck

# Build everything that has a build script
pnpm run build

# Generate Prisma client
pnpm --filter @workspace/db run generate

# Push Prisma schema to Supabase Postgres
pnpm --filter @workspace/db run push

# Regenerate API clients/schemas from OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Seed demo data, if .env is configured
pnpm --filter @workspace/scripts seed
```

## Environment variables

Use `.env.example` as the source of truth. The main groups are:

### Supabase and database

- `DATABASE_URL` — pooled Supabase Postgres URL for runtime Prisma queries. Include `?pgbouncer=true` and `schema=commit_hr`.
- `DIRECT_URL` — direct Supabase Postgres URL for Prisma migrations/schema operations.
- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — browser-safe Supabase publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only service role key. Do not expose it to frontend code.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — frontend Supabase values exposed by Vite.

### API server

- `PORT` — API server port; local default is `8080`.
- `SESSION_SECRET` — strong random secret for sessions/cookies.
- `SESSION_COOKIE_SECURE` — set `true` behind HTTPS in production.
- `CORS_ORIGIN` — comma-separated list of allowed frontend origins.
- `UPLOAD_RESUMES_DIR` — optional absolute path for uploaded resumes.
- `NODE_ENV` — set to `production` in deployed environments.

### AI, enrichment, and email

- `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_BASE_URL` and retry/timeout controls.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_DEEP_SCREENING_MODEL`, optional retry/timeout controls.
- `AI_BRAND_*`, `AI_*_CAP`, `AI_*_TEMPERATURE`, and screening rubric variables for prompt behaviour and token budgets.
- `APIFY_TOKEN` for optional LinkedIn enrichment.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` for optional email delivery.

Never commit real secrets. `.env.example` intentionally uses placeholders for private keys and tokens.

## Supabase notes

The Prisma datasource uses PostgreSQL and targets the `commit_hr` schema:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["commit_hr"]
}
```

Use the pooled `DATABASE_URL` for application runtime and the direct `DIRECT_URL` for Prisma schema operations. The user profile rows are designed to align with Supabase Auth users; create users through Supabase Auth/admin APIs and update profile metadata in the application table as needed.

## Railway deployment

This repo deploys to Railway as two services:

- `api-server`, configured by `railway.api-server.json`
- `hr-platform`, configured by `railway.hr-platform.json`

For the full deployment checklist, required service variables, healthcheck behaviour, watch path suggestions, and first-deploy sequence, read [RAILWAY.md](./RAILWAY.md). This README intentionally keeps the Railway section brief so the deployment runbook remains the single source of truth.

At a high level:

1. Connect the GitHub repository to the Railway project.
2. Create one service for the API and one service for the frontend.
3. Set each service's config path to its matching `railway.*.json` file.
4. Configure all required variables from `.env.example` and `RAILWAY.md`.
5. Deploy from `main`, then set the API service `CORS_ORIGIN` to the frontend's public domain.

The API exposes `/api/health` for Railway healthchecks and `/api/healthz` for simple status checks.

## API contracts and generated clients

The OpenAPI source lives at `lib/api-spec/openapi.yaml`. Generated outputs are committed under:

- `lib/api-client-react/src/generated/`
- `lib/api-zod/src/generated/`

When API routes or schemas change, update the OpenAPI spec and regenerate the clients before opening a PR.

## Development conventions

- Keep application code TypeScript-first and package-local.
- Keep database changes in `lib/db/prisma/schema.prisma` and migrations when needed.
- Keep OpenAPI, generated React client code, and generated Zod schemas in sync with API behaviour.
- Prefer environment-driven configuration over hardcoded URLs or secrets.
- Cross-reference deployment details from `RAILWAY.md` instead of duplicating long Railway instructions in other docs.

## Troubleshooting

- If Prisma cannot connect locally, verify both `DATABASE_URL` and `DIRECT_URL`, the Supabase project password, and the `commit_hr` schema.
- If AI features return mock/stub responses, confirm the relevant provider API keys are set.
- If the frontend cannot reach the API in development, ensure the API is running on port `8080` and that the Vite proxy is active.
- If Railway healthchecks fail, inspect the `api-server` logs and confirm `/api/health` responds from the deployed API service.
