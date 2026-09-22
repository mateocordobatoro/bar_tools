import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, destination, type Access, type StaffRole } from "./access";

// React cache deduplicates within a render only; never persist profiles across requests.
export const getAccess = cache(async (): Promise<Access> => {
  try { return await resolveAccess(await createClient()); }
  catch { return { kind: "unavailable" }; }
});

/** Call at every protected data/page/action boundary, not just in middleware. */
export async function requireStaff(role: StaffRole) {
  const access = await getAccess();
  if (access.kind !== "staff" || access.staff.role !== role) redirect(destination(access));
  return access.staff;
}
