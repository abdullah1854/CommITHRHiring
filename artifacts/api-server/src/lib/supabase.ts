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

/**
 * Verifies a Supabase access token and returns the linked profile from
 * commit_hr.users. Returns null if the token is invalid, the user is not
 * mirrored yet, or the user is deactivated.
 *
 * Uses supabase.auth.getUser to verify the JWT (network call to Supabase
 * Auth), then Prisma to load the profile (direct Postgres query — bypasses
 * the public-only PostgREST exposure).
 */
export async function verifyAccessToken(
  token: string,
): Promise<SupabaseSessionUser | null> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const profile = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!profile || !profile.isActive) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    isActive: profile.isActive,
  };
}
