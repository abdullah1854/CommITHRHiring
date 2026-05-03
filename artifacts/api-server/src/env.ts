import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the workspace .env regardless of how the entrypoint is invoked.
 * Bundled production runs from `artifacts/api-server/dist/index.mjs`, source runs
 * from `artifacts/api-server/src/index.ts`. We walk up looking for a folder that
 * contains a `.env` file, then a `package.json` with workspaces, before falling
 * back to a fixed relative path.
 */
function findWorkspaceEnv(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Always allow an explicit override via DOTENV_CONFIG_PATH / ENV_FILE.
const explicit =
  process.env.DOTENV_CONFIG_PATH || process.env.ENV_FILE || null;

const cwdEnv = path.resolve(process.cwd(), ".env");
const walkedEnv = findWorkspaceEnv(here);
const fixedFallback = path.resolve(here, "../../../.env");

const sources: string[] = [];
function loadFrom(file: string | null, opts: { override: boolean }) {
  if (!file) return;
  if (!fs.existsSync(file)) return;
  const result = config({ path: file, override: opts.override });
  if (!result.error) sources.push(file);
}

// 1. Walked-up workspace .env (covers both src and dist runs).
loadFrom(walkedEnv ?? fixedFallback, { override: false });
// 2. Explicit ENV_FILE if provided — highest precedence after process env.
loadFrom(explicit, { override: true });
// 3. Local cwd .env — overrides workspace values when running per-package.
if (cwdEnv !== walkedEnv && cwdEnv !== explicit) {
  loadFrom(cwdEnv, { override: true });
}

if (process.env.NODE_ENV === "production") {
  const corsOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes("*")) {
    throw new Error("CORS_ORIGIN must list explicit origins in production; wildcard is not allowed");
  }
}

console.log(
  `[env] cwd=${process.cwd()} loaded=${sources.length ? sources.join(", ") : "(none)"} ` +
    `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? "set" : "MISSING"} ` +
    `DATABASE_URL=${process.env.DATABASE_URL ? "set" : "MISSING"}`,
);
