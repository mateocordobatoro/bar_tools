import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";
import { authCookieOptions } from "./cookie-options";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const client = createServerClient(url, publishableKey, {
      cookieOptions: authCookieOptions(),
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request });
          previous.forEach(cookie => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await client.auth.getUser();
  } catch {
    // Pages/actions independently verify Auth and fail closed; never log tokens/errors.
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}
