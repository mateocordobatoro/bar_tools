"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, destination } from "@/lib/auth/access";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" ||
    !email.trim() || email.length > 254 || !password || password.length > 1024) redirect("/login?error=credentials");
  let target = "/auth/unavailable";
  try {
    const client = await createClient({ writable: true });
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    target = error ? "/login?error=credentials" : destination(await resolveAccess(client));
  } catch { /* Fixed error route; never expose upstream messages or submitted values. */ }
  redirect(target);
}

export async function logout() {
  let target = "/auth/unavailable";
  try {
    const client = await createClient({ writable: true });
    const { error } = await client.auth.signOut({ scope: "local" });
    if (!error) target = "/login";
  } catch { /* Do not claim sign-out succeeded on a network/cookie failure. */ }
  redirect(target);
}
