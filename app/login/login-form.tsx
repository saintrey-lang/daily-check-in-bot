"use client";

import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally { setWorking(false); }
  }
  return <main className="auth-shell"><form className="auth-card" onSubmit={submit}>
    <span className="eyebrow">DISCORD EVENT OPERATIONS</span>
    <div className="mark">✦</div>
    <h1>Daily Check-In</h1>
    <p>Sign in to manage the 15-day event and its Discord messages.</p>
    <label className="field-label" htmlFor="password">Dashboard password</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required minLength={16} />
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary full" disabled={working}>{working ? "Signing in…" : "Open dashboard"}</button>
  </form></main>;
}
