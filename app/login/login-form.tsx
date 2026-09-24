export default function LoginForm({ error }: { error: string }) {
  return <main className="auth-shell"><section className="auth-card">
    <span className="eyebrow">DISCORD EVENT OPERATIONS</span>
    <div className="mark">✦</div>
    <h1>Daily Check-In</h1>
    <p>Sign in with your Discord account to manage the 15-day event. Access is limited to members with the dashboard role.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <a className="primary full discord-login" href="/api/auth/discord">Continue with Discord ↗</a>
  </section></main>;
}
