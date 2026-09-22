import Link from "next/link";
import { logout } from "@/app/auth/actions";
export const dynamic = "force-dynamic";
export default function AuthUnavailable() {
  return <main className="shell"><section className="card auth-card">
    <div className="eyebrow">BarThings</div><h1>Unable to verify access</h1>
    <p>We could not verify your session or staff access. Please try again.</p>
    <Link href="/">Try again</Link><form action={logout}><button type="submit">Sign out</button></form>
  </section></main>;
}
