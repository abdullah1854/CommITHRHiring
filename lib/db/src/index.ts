import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma__: PrismaClient | undefined;
}

function createPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (sqlserver://...)");
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalThis.__prisma__ ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalThis.__prisma__ = prisma;

export { prisma as db };
export * from "@prisma/client";

function normalizeListItems(items: unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of items) {
    const value = String(item ?? "").trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return normalizeListItems(raw);
  if (typeof raw !== "string" || !raw.trim()) return [];

  const trimmed = raw.trim();
  try {
    const v = JSON.parse(trimmed);
    if (Array.isArray(v)) return normalizeListItems(v);
  } catch {
    // Legacy or hand-authored rows may contain comma-separated values instead
    // of a JSON array. Treat simple comma lists as recoverable data rather than
    // silently dropping core job/candidate matching signals.
  }

  return normalizeListItems(trimmed.split(","));
}

export function serializeList(value: unknown): string {
  if (!value) return "[]";
  if (Array.isArray(value)) return JSON.stringify(normalizeListItems(value));
  if (typeof value === "string") return JSON.stringify(parseList(value));
  return "[]";
}
