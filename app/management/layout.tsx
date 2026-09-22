import { requireStaff } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaff("management");
  return children;
}
