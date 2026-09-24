import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorizedSession, SESSION_COOKIE } from "@/lib/auth";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const needed = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_ALLOWED_ROLE_ID", "DASHBOARD_BASE_URL", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "CHECKIN_GOOGLE_SHEET_ID"];
  const missing = needed.filter((name) => !process.env[name]);
  if (missing.length) {
    return <main className="auth-shell"><section className="auth-card">
      <span className="eyebrow">SETUP REQUIRED</span>
      <h1>Daily Check-In</h1>
      <p>Add these environment variables to this Vercel project: <code>{missing.join(", ")}</code>. Then redeploy to enable Discord sign-in.</p>
    </section></main>;
  }
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!await authorizedSession(cookie)) redirect("/login");
  return <Dashboard />;
}
