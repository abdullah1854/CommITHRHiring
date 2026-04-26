# GIQ - AI-Powered HR Recruitment Platform

## Project Overview

GIQ is an enterprise HR recruitment platform with AI-powered candidate screening, ranking, job description generation, and interview management. Built as a React+Vite SPA with an Express 5 backend, Azure SQL Server database (via Prisma ORM), and OpenAI integration.

## Architecture

pnpm workspace monorepo with TypeScript across all packages.

```text
workspace/
├── artifacts/
│   ├── hr-platform/         # React+Vite SPA frontend (port via $PORT, proxied to /)
│   └── api-server/          # Express 5 REST API backend (port 8080)
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval codegen config
│   ├── api-client-react/    # Generated React Query hooks (Orval output)
│   ├── api-zod/             # Generated Zod schemas (Orval output)
│   └── db/                  # Prisma ORM schema + Azure SQL Server connection
└── scripts/                 # Utility scripts
```

## Stack

- **Frontend**: React 18 + Vite 7, TailwindCSS, shadcn/ui, React Query, Wouter, Framer Motion, Recharts
- **Backend**: Express 5, TypeScript, tsx (dev hot-reload)
- **Database**: Azure SQL Server + Prisma ORM (connected via `DATABASE_URL` sqlserver connection string)
- **AI**: OpenAI (base model **GPT-4o** for screening, summaries, interview questions, JD generation/improvement, and resume parsing). Configurable via `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL`, with legacy fallback to `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.
- **Auth**: Session-based (`express-session`), httpOnly cookies, 24h TTL
- **API client**: Orval-generated React Query hooks from OpenAPI spec
- **API type-safety**: Orval-generated Zod schemas
- **Package manager**: pnpm workspaces

## Features

1. **Public pages**: Landing/home, careers listing, public job detail
2. **Auth**: Email/password login + demo login (admin/recruiter roles)
3. **Dashboard**: Metrics overview, recent candidates, activity chart
4. **Jobs**: CRUD, AI-powered JD generation & improvement
5. **Candidates**: Pipeline management, status tracking, AI screening/ranking
6. **Resume Upload**: PDF/DOC drag-and-drop upload with AI parsing
7. **Interviews**: Schedule, manage, send invites
8. **AI Tools**: Generate JD, Improve JD with OpenAI
9. **Analytics**: Pipeline funnel, status charts, activity trends, job performance
10. **Admin Panel**: User management (admin-only)

## Key Files

- `artifacts/hr-platform/src/App.tsx` — Router with protected route wrapper
- `artifacts/hr-platform/src/hooks/use-auth.tsx` — Auth context (session + demo login)
- `artifacts/hr-platform/src/components/layout/DashboardLayout.tsx` — Sidebar layout
- `artifacts/api-server/src/app.ts` — Express app with middlewares
- `artifacts/api-server/src/routes/index.ts` — Route mounting
- `artifacts/api-server/src/lib/aiService.ts` — OpenAI service
- `lib/db/prisma/schema.prisma` — Prisma ORM schema (source of truth for tables)
- `lib/api-spec/openapi.yaml` — OpenAPI 3.1 spec (source of truth for API)

## API Endpoints

All endpoints prefixed with `/api`:

- **Auth**: `GET /auth/me`, `POST /auth/login`, `POST /auth/demo-login`, `POST /auth/logout`
- **Jobs**: `GET /jobs`, `POST /jobs`, `GET /jobs/:id`, `PUT /jobs/:id`, `DELETE /jobs/:id`
- **Candidates**: `GET /candidates`, `POST /candidates`, `GET /candidates/:id`, `PUT /candidates/:id`, `POST /candidates/:id/reject`, `POST /candidates/:id/shortlist`
- **Resumes**: `POST /resumes/upload`, `GET /resumes/files/:filename`
- **AI**: `POST /ai/screen`, `GET /ai/rank/:jobId`, `POST /ai/summary`, `POST /ai/interview-questions`, `POST /ai/generate-jd`, `POST /ai/improve-jd`
- **Interviews**: `GET /interviews`, `POST /interviews`, `GET /interviews/:id`, `PUT /interviews/:id`, `DELETE /interviews/:id`, `POST /interviews/:id/send-invite`
- **Analytics**: `GET /analytics/overview`, `GET /analytics/pipeline`, `GET /analytics/trends`, `GET /analytics/jobs`
- **Notifications**: `GET /notifications`, `PUT /notifications/:id/read`
- **Users**: `GET /users`, `POST /users`, `GET /users/:id`, `PUT /users/:id`

## Demo Login

- **Admin**: POST `/api/auth/demo-login` with `{"role": "admin"}` → creates/finds `admin@talentiq.demo`
- **Recruiter**: POST `/api/auth/demo-login` with `{"role": "recruiter"}` → creates/finds `recruiter@talentiq.demo`
- Frontend has "Admin Login" and "Recruiter Login" buttons on the login page

## Vite Proxy

`artifacts/hr-platform/vite.config.ts` proxies `/api/*` → `http://localhost:8080` for dev.

## Database Schema

Tables: `users`, `jobs`, `candidates`, `resumes`, `applications`, `ai_screening_results`, `ai_candidate_summaries`, `interviews`, `email_notifications`, `audit_logs`

Generate Prisma client: `pnpm --filter @workspace/db run generate`
Push schema to database: `pnpm --filter @workspace/db run push` (runs `prisma db push`)

## Environment Variables

- `DATABASE_URL` — Prisma sqlserver connection string (e.g. `sqlserver://HOST:1433;database=DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=false`)
- `SESSION_SECRET` — Required for session middleware (auto-set)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI proxy URL (Replit integration)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key (Replit integration)
- `PORT` — App port (auto-assigned per artifact by Replit)
- `BASE_PATH` — URL base path (auto-assigned per artifact by Replit)
- `SMTP_USER`, `SMTP_PASS` — Optional email sending credentials

## Setup

```bash
# 1. Install workspace dependencies
pnpm i

# 2. Copy .env.example → .env and fill in secrets
#    Required: OPENAI_API_KEY, DATABASE_URL
#    Optional: SESSION_SECRET, SMTP_*
cp .env.example .env

# 3. Generate the Prisma client, then push the schema to Azure SQL (creates all tables)
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run push

# 4. Start the API server (http://localhost:8080)
pnpm --filter @workspace/api-server dev

# 5. In another shell, start the web app (Vite dev server)
pnpm --filter @workspace/hr-platform dev
```

Optional: seed a demo admin + recruiter + 2 sample jobs (idempotent):
`pnpm --filter @workspace/scripts seed`

## Development

```bash
# Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/hr-platform run dev

# Generate Prisma client (after schema changes)
pnpm --filter @workspace/db run generate

# Push Prisma schema to the database
pnpm --filter @workspace/db run push

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

## Workflows

- `artifacts/api-server: API Server` — Express dev server on port 8080
- `artifacts/hr-platform: web` — Vite dev server on dynamic port
