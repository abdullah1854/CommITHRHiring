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

export function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function serializeList(value: unknown): string {
  if (!value) return "[]";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(Array.isArray(parsed) ? parsed : []);
    } catch {
      return "[]";
    }
  }
  return JSON.stringify(Array.isArray(value) ? value : []);
}
