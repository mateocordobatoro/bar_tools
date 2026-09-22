import { requireStaff } from "@/lib/auth/session";
import { logout } from "@/app/auth/actions";
export default async function Page() {
  const staff = await requireStaff("management");
  return <main className="shell"><section className="card auth-card">
    <div className="eyebrow">BarThings · Management</div>
    <h1>Welcome, {staff.display_name}</h1>
    <p>Your management access is verified. Your workspace will be available here.</p>
    <form action={logout}><button type="submit">Sign out</button></form>
  </section></main>;
}
