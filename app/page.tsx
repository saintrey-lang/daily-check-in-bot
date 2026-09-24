import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  const needed = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "CHECKIN_GOOGLE_SHEET_ID"];
  const missing = needed.filter((name) => !process.env[name]);
  if (missing.length) {
    return <main className="auth-shell"><section className="auth-card">
      <span className="eyebrow">SETUP REQUIRED</span>
      <h1>Daily Check-In</h1>
      <p>Add these environment variables to this Vercel project: <code>{missing.join(", ")}</code>. Then redeploy.</p>
    </section></main>;
  }
  return <Dashboard />;
}
