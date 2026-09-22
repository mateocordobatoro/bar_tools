/** Read lazily so the scaffold can build before Supabase is configured. */
export function getSupabaseConfig() {
  // Keep direct accesses: Next.js inlines NEXT_PUBLIC_* values in browser builds.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw Object.assign(new Error("Supabase requires a project URL and publishable key."), { code: "missing_configuration" });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error("Supabase project URL is invalid."), { code: "invalid_url" });
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw Object.assign(new Error("Supabase requires an HTTPS project origin (HTTP is allowed on loopback only)."), { code: "invalid_url" });
  }

  if (!/^sb_publishable_\S+$/.test(publishableKey)) {
    throw Object.assign(new Error("Supabase requires a publishable key."), { code: "invalid_api_key" });
  }

  return { url: parsed.origin, publishableKey };
}
