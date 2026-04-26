# Railway deployment

This monorepo deploys as **two services** on a single Railway project.

## One-time setup

1. **Create the Railway project**
   - `railway login`
   - `railway init` (or create via dashboard) → call it `commit-hr` or similar.

2. **Connect the GitHub repo**
   - Settings → Source → connect `abdullah1854/CommITHRHiring`.
   - Branch: `main`.

3. **Add two services**

   **Service A — `api-server`**
   - Settings → Service → **Config Path**: `railway.api-server.json`
   - Settings → Service → **Root Directory**: leave blank (uses repo root, required for pnpm workspace install).
   - Watch paths (optional): `artifacts/api-server/**`, `lib/**`, `pnpm-lock.yaml`.
   - Networking → Generate domain (e.g. `commit-hr-api.up.railway.app`).
   - Variables (set all of these):
     - `DATABASE_URL` — Supabase pooled URL (`...pooler.supabase.com:6543/postgres?pgbouncer=true&schema=commit_hr`)
     - `DIRECT_URL` — Supabase direct URL (port 5432)
     - `SUPABASE_URL` — `https://qfcuisdluubwelihkbqf.supabase.co`
     - `SUPABASE_SERVICE_ROLE_KEY` — service role key from Supabase Studio (NEVER expose to frontend)
     - `OPENAI_API_KEY`
     - `OPENAI_MODEL` — confirmed exact OpenAI model id (e.g. `gpt-5.4-mini`)
     - `ANTHROPIC_API_KEY`
     - `ANTHROPIC_DEEP_SCREENING_MODEL` — `claude-sonnet-4-6`
     - `CORS_ORIGIN` — the public URL of the hr-platform service (set after Service B has a domain)
     - `SESSION_COOKIE_SECURE=true`
     - `NODE_ENV=production`
     - `APIFY_TOKEN` (optional)
     - `SMTP_*` (optional)
     - `AI_BRAND_NAME="COMM-iT Group"`
     - `AI_BRAND_VOICE` / `AI_BRAND_LOCALE` — see `.env.example`

   **Service B — `hr-platform`**
   - Settings → Service → **Config Path**: `railway.hr-platform.json`
   - Settings → Service → **Root Directory**: leave blank.
   - Watch paths (optional): `artifacts/hr-platform/**`, `lib/api-client-react/**`, `lib/api-zod/**`, `pnpm-lock.yaml`.
   - Networking → Generate domain.
   - Variables:
     - `VITE_SUPABASE_URL` — `https://qfcuisdluubwelihkbqf.supabase.co`
     - `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable key (`sb_publishable_*`) — browser-safe
     - `API_URL` — public URL of Service A (the api-server) so the Vite proxy / preview reverse-proxies `/api` correctly. In production, you typically want the frontend to call the api-server origin directly through CORS — set `VITE_API_URL` instead and read it in the API client base URL config.
     - `PORT` — Railway sets this automatically; do not override.

4. **First deploy**
   - Push to `main`. Railway picks up the per-service `railway.*.json` and builds.
   - After Service B is up, copy its domain into Service A's `CORS_ORIGIN`.

## Notes

- Both services install the full pnpm workspace (`pnpm install --frozen-lockfile` from the repo root) before running their service-specific build. This is necessary because the workspace-shared packages (`@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`) are not published to a registry.
- `pnpm --filter @workspace/db generate` runs on the api-server build to generate the Prisma client before the esbuild bundle picks it up.
- The api-server `startCommand` runs the bundled output at `artifacts/api-server/dist/index.mjs`. The bundle is produced by `artifacts/api-server/build.ts`.
- The hr-platform `startCommand` runs `vite preview` (the `serve` script in `artifacts/hr-platform/package.json`) bound to `$PORT`. For higher production polish you can swap this for a static file server like `npx serve dist/public -l $PORT`.
- Healthcheck path `/api/health` assumes `routes/health.ts` exposes a 200 OK GET on `/api/health` — verify before enabling.
