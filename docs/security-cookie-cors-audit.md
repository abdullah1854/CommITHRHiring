# Security audit: api-server cookies, sessions, CORS, and Railway HTTPS

Date: 2026-05-03
Scope: `artifacts/api-server`, Railway deployment docs, environment templates, and frontend API call patterns.

## Executive summary

The api-server no longer mounts Express session middleware or emits application cookies. Authentication is performed with Supabase JWT bearer tokens in the `Authorization` header. Because of that, there is no active Express session cookie needing `secure`, `httpOnly`, `sameSite`, `maxAge`, `trust proxy`, or Railway proxy handling today.

The main remaining security surface is CORS. Production correctly denies cross-origin requests when `CORS_ORIGIN` is unset, but it also keeps `credentials: true` for compatibility with legacy frontend fetches that still pass `credentials: "include"`. This audit adds a production guard that rejects `CORS_ORIGIN=*`, documents the current posture, and removes stale session-cookie configuration references that could mislead future deploys.

## Findings

### [Medium] Production CORS must never use wildcard origins with credentials

Evidence:
- `artifacts/api-server/src/app.ts` enables CORS with `credentials: true`.
- Production behavior denies CORS when `CORS_ORIGIN` is empty, but before this audit it did not reject an explicit `CORS_ORIGIN=*` value.
- `RAILWAY.md` instructs operators to set `CORS_ORIGIN` to the hr-platform public URL, which is the right deployment shape.

Impact:
- `Access-Control-Allow-Origin: *` is invalid with credentialed requests in browsers and is unsafe if cookies are introduced later.
- Misconfiguration could cause production frontend failures or widen browser access beyond the intended Railway frontend origin.

Remediation applied:
- `artifacts/api-server/src/app.ts` now throws during production startup if `CORS_ORIGIN` contains `*`.
- Keep `credentials: true` only for compatibility with existing frontend fetches that use `credentials: "include"`; use explicit origins in production.

Recommended follow-up:
- Gradually remove `credentials: "include"` from frontend manual fetches that do not use cookies, then set API CORS `credentials` to `false` if no cookie-backed auth is reintroduced.

### [Low] Stale session-cookie variables remained in docs/templates

Evidence:
- `RAILWAY.md` listed `SESSION_COOKIE_SECURE=true` for api-server Railway variables.
- `.env.example` listed `SESSION_SECRET` and `SESSION_COOKIE_SECURE`.
- `artifacts/api-server/src/env.ts` logged `SESSION_SECRET` as required/missing even though no session middleware reads it.
- `replit.md` still described auth as session-based.

Impact:
- Operators could spend time setting unnecessary secrets or mistakenly believe cookie-backed sessions are active.
- Future changes could copy stale cookie guidance instead of making an explicit cookie/security design decision.

Remediation applied:
- Removed stale session-cookie env entries from `.env.example` and `RAILWAY.md`.
- Removed `SESSION_SECRET` from api-server env startup logging.
- Updated `replit.md` to describe Supabase JWT bearer auth.

### [Info] Railway HTTPS and Express `trust proxy`

Evidence:
- The api-server does not create or configure cookies.
- No `app.set("trust proxy", ...)` is present.
- Railway terminates public HTTPS before forwarding traffic to the service.

Impact:
- With no Express-generated secure cookies, `trust proxy` is not required for session cookies today.
- If cookie-backed auth is reintroduced, Railway deployments should set `app.set("trust proxy", 1)` before session middleware so Express can correctly identify HTTPS via `X-Forwarded-Proto` and emit `secure` cookies behind the proxy.

Recommendation:
- Treat any future cookie-backed session work as a new security design change requiring `httpOnly`, `secure`, explicit `sameSite`, `maxAge`, CSRF review, and Railway `trust proxy` configuration.

## Current expected production configuration

api-server Railway variables relevant to this audit:

- `NODE_ENV=production`
- `CORS_ORIGIN=https://<hr-platform-public-domain>`; comma-separate additional explicit origins only if needed.
- Do not set `CORS_ORIGIN=*` in production.
- No `SESSION_SECRET` or `SESSION_COOKIE_SECURE` is required unless a future PR reintroduces cookie-backed sessions.

## Files changed by this audit

- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/env.ts`
- `.env.example`
- `RAILWAY.md`
- `replit.md`
- `docs/security-cookie-cors-audit.md`
