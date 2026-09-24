import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!process.env.DASHBOARD_PASSWORD || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return <main className="auth-shell"><section className="auth-card">
      <span className="eyebrow">SETUP REQUIRED</span>
      <h1>Daily Check-In</h1>
      <p>Add <code>DASHBOARD_PASSWORD</code>, <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>, and <code>GOOGLE_PRIVATE_KEY</code> to this Vercel project to open the dashboard.</p>
    </section></main>;
  }
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(cookie)) redirect("/login");
  return <Dashboard />;
}
