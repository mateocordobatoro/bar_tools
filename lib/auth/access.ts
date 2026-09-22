import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "management" | "bartender";
export type Staff = { id: string; auth_user_id: string; display_name: string; role: StaffRole; active: true };
export type Access =
  | { kind: "anonymous" | "blocked" | "unavailable" }
  | { kind: "staff"; staff: Staff };

/** getUser verifies with Auth; cookies and user_metadata are never role evidence. */
export async function resolveAccess(client: SupabaseClient): Promise<Access> {
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error) {
      return { kind: error.name === "AuthSessionMissingError" || [400, 401, 403].includes(error.status ?? 0)
        ? "anonymous" : "unavailable" };
    }
    if (!user) return { kind: "anonymous" };
    if (user.is_anonymous) return { kind: "blocked" };
    const { data, error: profileError } = await client.from("app_users")
      .select("id, auth_user_id, display_name, role, active")
      .eq("auth_user_id", user.id).maybeSingle();
    if (profileError) return { kind: "unavailable" };
    if (!data || data.active !== true || data.auth_user_id !== user.id ||
      !["management", "bartender"].includes(data.role)) return { kind: "blocked" };
    return { kind: "staff", staff: data as Staff };
  } catch {
    return { kind: "unavailable" };
  }
}

export function destination(access: Access): string {
  if (access.kind === "staff") return access.staff.role === "management" ? "/management" : "/bartender";
  if (access.kind === "anonymous") return "/login";
  return access.kind === "blocked" ? "/access-denied" : "/auth/unavailable";
}
