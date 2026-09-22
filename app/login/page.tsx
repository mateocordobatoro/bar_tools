import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth/session";
import { destination } from "@/lib/auth/access";
import { login } from "@/app/auth/actions";
import { SubmitButton } from "./submit-button";

export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await getAccess();
  if (access.kind !== "anonymous") redirect(destination(access));
  const { error } = await searchParams;
  return <main className="shell"><section className="card auth-card">
    <div className="eyebrow">BarThings</div><h1>Sign in</h1>
    <p>Use the email and password provided for your staff account.</p>
    {error && <p className="notice" role="alert">{error === "callback" ? "This sign-in link could not be verified. Sign in again or contact your manager." : "Unable to sign in. Check your details and try again."}</p>}
    <form action={login} className="auth-form">
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required />
      <SubmitButton />
    </form><p className="help">Staff accounts are provisioned by an authorized manager. Public signup is not available.</p>
  </section></main>;
}
