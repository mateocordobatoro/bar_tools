import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth/session";
import { destination } from "@/lib/auth/access";
import { logout } from "@/app/auth/actions";
export const dynamic = "force-dynamic";
export default async function AccessDenied() {
  const access = await getAccess();
  if (access.kind !== "blocked") redirect(destination(access));
  return <main className="shell"><section className="card auth-card">
    <div className="eyebrow">BarThings</div><h1>Access unavailable</h1>
    <p>Your account does not have active staff access. Contact your manager.</p>
    <form action={logout}><button type="submit">Sign out</button></form>
  </section></main>;
}
