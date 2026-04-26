// Cross-platform preinstall: enforce pnpm and remove stray npm/yarn lockfiles.
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ua = process.env.npm_config_user_agent ?? "";
if (!ua.startsWith("pnpm/")) {
  console.error("Use pnpm to install dependencies (current agent: " + (ua || "unknown") + ")");
  process.exit(1);
}

for (const file of ["package-lock.json", "yarn.lock"]) {
  const p = resolve(process.cwd(), file);
  if (existsSync(p)) {
    try {
      rmSync(p, { force: true });
      console.log(`[preinstall] removed stray ${file}`);
    } catch (err) {
      console.warn(`[preinstall] could not remove ${file}:`, err?.message ?? err);
    }
  }
}
