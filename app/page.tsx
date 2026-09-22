import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth/session";
import { destination } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
export default async function Home() { redirect(destination(await getAccess())); }
