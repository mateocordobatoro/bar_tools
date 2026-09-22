// Auth is server-only in this phase; the browser Supabase helper is not used for login.
export function authCookieOptions() {
  return { path: "/", sameSite: "lax" as const, httpOnly: true, secure: process.env.NODE_ENV === "production" };
}
