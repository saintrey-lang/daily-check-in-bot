import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorizedSession, SESSION_COOKIE } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await authorizedSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/");
  const { error } = await searchParams;
  return <LoginForm error={error === "role" ? "Your Discord account does not have the dashboard access role in this server." : error ? "Discord sign-in did not complete. Please try again." : ""} />;
}
