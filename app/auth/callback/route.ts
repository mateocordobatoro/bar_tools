import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, destination } from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  let target = "/login?error=callback";
  if (code && code.length <= 4096) {
    try {
      const client = await createClient({ writable: true });
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) target = destination(await resolveAccess(client));
    } catch { /* Fixed destination; never echo authorization codes or provider errors. */ }
  }
  // Deliberately ignores next/redirect_to parameters: no user-controlled redirects.
  const response = new NextResponse(null, { status: 303, headers: { Location: target } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
