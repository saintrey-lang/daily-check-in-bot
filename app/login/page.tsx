import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (process.env.DASHBOARD_PASSWORD && verifySession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/");
  return <LoginForm />;
}
