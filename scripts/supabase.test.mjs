import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabaseConfig } from "../lib/supabase/config.ts";
import { checkSupabaseConnection, runConnectivityCheck } from "./check-supabase.mjs";

const config = { url: "https://example.supabase.co", publishableKey: "sb_publishable_test-only" };

test("configuration accepts publishable keys and rejects unsafe configuration without leaking values", (t) => {
  t.mock.property(process, "env", {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  });
  assert.deepEqual(getSupabaseConfig(), config);

  for (const key of ["", "sb_secret_sensitive", "eyJlegacy-token"]) {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    assert.throws(getSupabaseConfig, { code: key ? "invalid_api_key" : "missing_configuration" });
  }
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = config.publishableKey;
  for (const url of ["not-a-url", "http://example.com", "https://user:password@example.com", "https://example.com/?secret=1", "https://example.com/#secret", "https://example.com/path"]) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    assert.throws(getSupabaseConfig, (error) => error.code === "invalid_url" && !error.message.includes(url));
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  assert.equal(getSupabaseConfig().url, "http://127.0.0.1:54321");
});

test("probe uses Auth settings without any table and discards the settings body", async () => {
  let cancelled = false;
  const result = await checkSupabaseConnection(config, async (url, options) => {
    assert.equal(url.href, "https://example.supabase.co/auth/v1/settings");
    assert.equal(options.method, "GET");
    assert.deepEqual(options.headers, { apikey: config.publishableKey, Accept: "application/json" });
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: true,
      headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
      body: { cancel: async () => { cancelled = true; }, getReader: () => assert.fail("must not read settings") },
      json() { assert.fail("must not read JSON"); },
      text() { assert.fail("must not read text"); },
    };
  });
  assert.equal(result, "ok");
  assert.equal(cancelled, true);
});

for (const [status, payload, expected] of [
  [401, { message: "Invalid API key" }, "invalid_api_key"],
  [401, { message: "Unregistered API key" }, "invalid_api_key"],
  [401, { code: "42501" }, "permission_error"],
  [403, { code: "42501" }, "permission_error"],
  [401, { code: "PGRST302" }, "permission_error"],
  [404, { code: "PGRST205" }, "missing_table"],
  [404, { code: "42P01" }, "missing_table"],
  [404, { code: "PGRST126" }, "metadata_disabled"],
  [404, {}, "endpoint_unavailable"],
  [401, {}, "authentication_error"],
  [401, { code: "PGRST301" }, "authentication_error"],
  [429, {}, "rate_limited"],
  [503, {}, "service_unavailable"],
]) {
  test(`HTTP ${status} ${payload.code ?? payload.message ?? "unknown"} is classified as ${expected}`, async () => {
    const response = Response.json({ ...payload, details: "sensitive data", hint: "sensitive hint" }, { status });
    assert.equal(await checkSupabaseConnection(config, async () => response), expected);
  });
}

test("oversized, non-JSON, and unexpected success responses are handled safely", async () => {
  for (const body of ["sensitive upstream HTML", "x".repeat(9000)]) {
    assert.equal(await checkSupabaseConnection(config, async () => new Response(body, { status: 401 })), "authentication_error");
  }
  assert.equal(await checkSupabaseConnection(config, async () => new Response("HTML")), "unexpected_response");
});

test("network failures and timeouts produce distinct fixed categories", async () => {
  assert.equal(await checkSupabaseConnection(config, async () => { throw new Error("sensitive detail"); }), "network_failure");
  assert.equal(await checkSupabaseConnection(config, async () => { throw new DOMException("sensitive timeout", "TimeoutError"); }), "timeout");
});

test("CLI fails closed before a network request when configuration is absent", async (t) => {
  t.mock.property(process, "env", { ...process.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" });
  const network = t.mock.method(globalThis, "fetch", async () => assert.fail("unexpected network request"));
  const output = t.mock.method(console, "error", () => {});
  assert.equal(await runConnectivityCheck(), 1);
  assert.equal(network.mock.callCount(), 0);
  assert.equal(output.mock.callCount(), 1);
});

test("CLI failure output never includes upstream errors or configuration values", async (t) => {
  t.mock.property(process, "env", {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  });
  t.mock.method(globalThis, "fetch", async () => { throw new Error(`sensitive ${config.url} ${config.publishableKey}`); });
  const output = t.mock.method(console, "error", () => {});
  assert.equal(await runConnectivityCheck(), 1);
  const text = output.mock.calls.flatMap((call) => call.arguments).join(" ");
  for (const value of ["sensitive", config.url, config.publishableKey]) assert.equal(text.includes(value), false);
});

test("CLI never prints upstream JSON fields, even unknown codes", async (t) => {
  t.mock.property(process, "env", {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: config.publishableKey, message: "sensitive", details: config.url }, { status: 403 }));
  const output = t.mock.method(console, "error", () => {});
  assert.equal(await runConnectivityCheck(), 1);
  const text = output.mock.calls.flatMap((call) => call.arguments).join(" ");
  assert.ok(text.includes("permission_error"));
  for (const value of ["sensitive", config.url, config.publishableKey]) assert.equal(text.includes(value), false);
});

test("successful CLI probe reports reachability without claiming key validation", async (t) => {
  t.mock.property(process, "env", {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ sensitive: "discard-me" }));
  const output = t.mock.method(console, "log", () => {});
  assert.equal(await runConnectivityCheck(), 0);
  const text = output.mock.calls.flatMap(call => call.arguments).join(" ");
  assert.match(text, /API is reachable/);
  assert.match(text, /API key validity.*remain unverified/);
  for (const value of ["discard-me", config.url, config.publishableKey]) assert.equal(text.includes(value), false);
});
