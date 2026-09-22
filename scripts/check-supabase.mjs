import { pathToFileURL } from "node:url";
import { getSupabaseConfig } from "../lib/supabase/config.ts";

const messages = {
  ok: "Supabase Auth API is reachable. No tables or migrations required. API key validity, database queries, user authentication, and RLS remain unverified.",
  missing_configuration: "Missing configuration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local or the environment.",
  invalid_url: "Invalid URL: use the HTTPS project origin without credentials, paths, query parameters, or fragments (HTTP is allowed on loopback only).",
  invalid_api_key: "Invalid API key: use the project's sb_publishable_ key and confirm it matches the configured project. Do not use a secret or service-role key.",
  authentication_error: "Authentication rejected: check the project's API authentication configuration. The response did not establish that the API key itself is invalid.",
  missing_table: "Table unavailable: the requested relation is missing or not exposed in the Data API schema cache. Do not run migrations just to satisfy a connectivity probe.",
  permission_error: "Permission denied: review API/schema grants and access configuration. Do not disable RLS or broaden grants for this check.",
  metadata_disabled: "The Data API responded, but OpenAPI metadata is disabled. The service is reachable; this diagnostic cannot verify its metadata endpoint. No need to enable metadata just for this check.",
  endpoint_unavailable: "API endpoint unavailable: verify the project origin and Auth service availability. A generic 404 does not establish that a table is missing.",
  service_unavailable: "Service unavailable: check the project status and Data API/database availability.",
  rate_limited: "Rate limited: retry later.",
  timeout: "Network timeout: the request exceeded five seconds.",
  network_failure: "Network failure: check DNS, TLS, connectivity, or sandbox/network restrictions. Redirects are not followed.",
  unexpected_response: "Unexpected response: verify the project origin and API configuration.",
};

// Only fixed categories leave this function; never return server messages/details.
export function classifyResponse(status, payload = {}) {
  const code = payload?.code;
  if (["PGRST205", "42P01"].includes(code)) return "missing_table";
  if (["42501", "PGRST302"].includes(code)) return "permission_error";
  if (code === "PGRST126") return "metadata_disabled";
  if (["PGRST301", "PGRST303"].includes(code)) return "authentication_error";
  if (status === 401 && ["Invalid API key", "No API key found in request", "Unregistered API key"].includes(payload?.message)) return "invalid_api_key";
  if (status === 401) return "authentication_error";
  if (status === 403) return "permission_error";
  if (status === 404) return "endpoint_unavailable";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_unavailable";
  return "unexpected_response";
}

// Bound error parsing; never print or persist any body or its fields.
async function readError(response) {
  const reader = response.body?.getReader();
  if (!reader) return {};
  try {
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) return {};
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Read public Auth settings only; no tables, sessions, counts, or writes. */
export async function checkSupabaseConnection(config, fetchRequest = fetch) {
  try {
    const response = await fetchRequest(new URL("/auth/v1/settings", config.url), {
      method: "GET",
      headers: { apikey: config.publishableKey, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const isJson = response.headers.get("content-type")?.split(";")[0].trim() === "application/json";
      // Discard public settings without reading or logging them.
      await response.body?.cancel();
      return isJson ? "ok" : "unexpected_response";
    }
    return classifyResponse(response.status, await readError(response));
  } catch (error) {
    return error?.name === "TimeoutError" ? "timeout" : "network_failure";
  }
}

export async function runConnectivityCheck() {
  let config;
  try {
    config = getSupabaseConfig();
  } catch (error) {
    const code = ["missing_configuration", "invalid_url", "invalid_api_key"].includes(error?.code) ? error.code : "missing_configuration";
    console.error(`Supabase check [${code}]: ${messages[code]}`);
    return 1;
  }
  const result = await checkSupabaseConnection(config);
  const log = result === "ok" ? console.log : console.error;
  log(`Supabase check [${result}]: ${messages[result]}`);
  return result === "ok" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runConnectivityCheck();
}
