import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// A local Docker/self-hosted stack is reached over plain HTTP on loopback,
// which is safe because the traffic never leaves the machine. Every other host
// must still use HTTPS.
const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?\/?$/i.test(
  url ?? "",
);
const validUrl = Boolean(url) && (isLoopback || /^https:\/\/[^/]+\/?$/.test(url!));
// Only a publishable key belongs in a Vite bundle. No server credential is accepted.
const validKey = Boolean(key?.startsWith("sb_publishable_"));

export const isConfigured = validUrl && validKey;

// Explains exactly which value is wrong instead of leaving a blank screen.
let problem = isConfigured
  ? ""
  : !url || !key
    ? "The portal's connection settings are missing (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY)."
    : !validUrl
      ? `The portal's service address is not valid: "${url}". It must be an https:// address, or http://localhost for a local installation.`
      : "The portal's publishable key is not valid. It must start with sb_publishable_.";

function createSupabaseClient() {
  if (!isConfigured) return null;
  try {
    return createClient(url!, key!);
  } catch {
    // A malformed value must never blank the whole page.
    problem =
      "The portal's connection settings could not be used. Check VITE_SUPABASE_URL.";
    return null;
  }
}

export const supabase = createSupabaseClient();
export const configError = problem;
