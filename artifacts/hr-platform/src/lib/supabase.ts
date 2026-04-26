import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !publishableKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set in the frontend env. " +
      "See .env.example.",
  );
}

// Browser-side client. Uses the publishable key (browser-safe). Never put the
// service-role key here — it bypasses RLS and exposes admin APIs.
export const supabase: SupabaseClient = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "commit-hr-auth",
  },
});

/**
 * Returns the current Supabase access token, or null if signed out.
 * Used by the API client to attach `Authorization: Bearer …` to backend
 * requests. Awaits an in-flight refresh if one is happening so we never
 * send a stale token.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}
