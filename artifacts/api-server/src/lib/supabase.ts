import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@workspace/db";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("SUPABASE_URL is required");
}
if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required (server-only, never ship to browser)");
}

// Server-side admin client — used only for auth.admin.* APIs (createUser,
// deleteUser, getUser). We do NOT use it to query commit_hr tables because
// PostgREST only exposes the `public` schema by default; profile lookups go
// through Prisma instead, which has direct Postgres access.
// NEVER expose this client or its key to the browser.
export const supabaseAdmin: SupabaseClient = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface SupabaseSessionUser {
  id: string;
  email: string;
  role: string;
  name: string;
  isActive: boolean;
}

// Short-lived cache for verified tokens. Each /me, /candidates, /jobs … call
// would otherwise hit Supabase Auth (≈300-500 ms round-trip) plus Prisma on
// every request. TTL is short enough (60 s) that deactivating a user
// propagates within a minute, but long enough to absorb a burst of React
// Query refetches during a single page navigation.
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 500;

interface CachedEntry {
  user: SupabaseSessionUser | null;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedEntry>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function pruneCache(now: number): void {
  if (tokenCache.size < TOKEN_CACHE_MAX) return;
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(key);
  }
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const oldest = tokenCache.keys().next().value;
    if (oldest) tokenCache.delete(oldest);
  }
}

/**
 * Verifies a Supabase access token and returns the linked profile from
 * commit_hr.users. Returns null if the token is invalid, the user is not
 * mirrored yet, or the user is deactivated.
 *
 * Uses supabase.auth.getUser to verify the JWT (network call to Supabase
 * Auth), then Prisma to load the profile (direct Postgres query — bypasses
 * the public-only PostgREST exposure). Both lookups are cached for
 * TOKEN_CACHE_TTL_MS to avoid hammering Supabase on every API request.
 */
export async function verifyAccessToken(
  token: string,
): Promise<SupabaseSessionUser | null> {
  const now = Date.now();
  const key = hashToken(token);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    tokenCache.set(key, { user: null, expiresAt: now + TOKEN_CACHE_TTL_MS });
    pruneCache(now);
    return null;
  }

  const profile = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  const result: SupabaseSessionUser | null =
    profile && profile.isActive
      ? {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          isActive: profile.isActive,
        }
      : null;

  tokenCache.set(key, { user: result, expiresAt: now + TOKEN_CACHE_TTL_MS });
  pruneCache(now);
  return result;
}
