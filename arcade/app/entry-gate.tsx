"use client";

import { useEffect, useState } from "react";
import { connectDiscordActivity } from "./discord-auth-client";

export default function EntryGate() {
  const [entry, setEntry] = useState<"checking" | "legacy" | "discord">("checking");
  useEffect(() => {
    if (!window.location.hostname.endsWith(".discordsays.com")) { setEntry("legacy"); return; }
    document.documentElement.classList.add("discord-activity");
    fetch("/api/activity-config", { cache: "no-store" }).then((response) => response.json()).then((config) => {
      setEntry(config.oauthEnabled ? "discord" : "legacy");
    }).catch(() => setEntry("legacy"));
  }, []);
  if (entry === "checking") return <main data-entry-gate className="gate-page"><div className="gate-card activity-loading" role="status">Checking arcade entry…</div></main>;
  return entry === "discord" ? <DiscordEntryGate /> : <LegacyEntryGate />;
}

function DiscordEntryGate() {
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState("");
  const [pin, setPin] = useState("");
  const [requiresPin, setRequiresPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        setLoading(true);
        setError("");
        const configResponse = await fetch("/api/activity-config", { cache: "no-store" });
        if (!configResponse.ok) throw new Error("Discord application is unavailable.");
        const { clientId } = await configResponse.json();
        const { player } = await connectDiscordActivity(clientId);
        if (!active) return;
        if (!player.needsGameId) { window.location.assign("/"); return; }
        setName(player.name);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Could not connect to Discord.");
      } finally { if (active) setLoading(false); }
    }
    connect();
    return () => { active = false; };
  }, [attempt]);

  async function link(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/discord-link", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Arcade-Activity": "1" },
        body: JSON.stringify({ gameId: gameId.trim(), ...(requiresPin ? { pin } : {}) }), cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.requiresLegacyPin) setRequiresPin(true);
        throw new Error(result.error || "Could not link your Game ID.");
      }
      window.location.assign("/");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not link your Game ID.");
      setLoading(false);
    }
  }

  return <main data-entry-gate className="gate-page">
    <header className="site-header"><a href="/" className="brand" aria-label="Golden Spatula Arcade home"><img className="brand-logo" src="/golden-spatula-logo.png" alt="" /><strong>ARCADE</strong></a><span className="header-pill"><span className="live-dot" /> DISCORD ENTRY</span></header>
    <section className="gate-layout">
      <div className="gate-intro"><span className="eyebrow">✳ YOUR ARENA AWAITS</span><h1>PLAY FOR<br /><em>GOLD.</em></h1><p>Your Discord account identifies you automatically when you join the Activity. Connect your Golden Spatula Game ID once to keep your points and progress.</p><div className="gate-art" aria-hidden="true"><img src="/golden-spatula-logo.png" alt="" /><span>✦ CROSSWORDS &nbsp; ✦ PUZZLE</span></div></div>
      <div className="gate-card"><span className="overline">WELCOME TO THE ARCADE</span><h2>{name ? `Playing as ${name}.` : "Connecting to Discord…"}</h2><p>{name ? "Link your Game ID once. The next time you open the Activity, your game resumes automatically." : "Discord may ask you to allow basic account identification."}</p>
        {name ? <form className="entry-form" onSubmit={link}>
          <label htmlFor="discord-game-id">GOLDEN SPATULA GAME ID</label><input id="discord-game-id" value={gameId} onChange={(event) => { setGameId(event.target.value); setPin(""); setRequiresPin(false); }} placeholder="Your Golden Spatula Game ID" maxLength={32} autoComplete="username" required />
          {requiresPin && <><label htmlFor="legacy-pin">OLD ARCADE PIN (ONE TIME)</label><input id="legacy-pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" pattern="[0-9]{4}" placeholder="••••" autoComplete="current-password" required /></>}
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "LINKING…" : "LINK GAME ID & PLAY →"}</button>
        </form> : <div className="entry-form">{error && <p className="error" role="alert">{error}</p>}{error && <button type="button" onClick={() => setAttempt((value) => value + 1)}>TRY DISCORD AGAIN →</button>}</div>}
        <p className="gate-note">Your Discord username appears with your score. Older Arcade entries require their PIN only once to recover saved progress.</p>
      </div>
    </section>
    <footer><span className="brand"><img className="brand-logo" src="/golden-spatula-logo.png" alt="Golden Spatula" /> <strong>ARCADE</strong></span><nav className="footer-links" aria-label="Legal"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav></footer>
  </main>;
}

function LegacyEntryGate() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [gameId, setGameId] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function enter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/entry", {
        method: "POST", headers: { "Content-Type": "application/json", ...(window.location.hostname.endsWith(".discordsays.com") ? { "X-Arcade-Activity": "1" } : {}) },
        body: JSON.stringify({ mode, gameId: gameId.trim(), name: name.trim(), pin, ...(mode === "register" ? { confirmPin } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not enter the arcade.");
      window.location.assign("/");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not enter the arcade.");
      setLoading(false);
    }
  }

  return <main data-entry-gate className="gate-page">
    <header className="site-header"><a href="/" className="brand" aria-label="Golden Spatula Arcade home"><img className="brand-logo" src="/golden-spatula-logo.png" alt="" /><strong>ARCADE</strong></a><span className="header-pill"><span className="live-dot" /> PLAYER ENTRY</span></header>
    <section className="gate-layout">
      <div className="gate-intro"><span className="eyebrow">✳ YOUR ARENA AWAITS</span><h1>PLAY FOR<br /><em>GOLD.</em></h1><p>One quick entry check before the games begin. Enter your name, Golden Spatula Game ID, and four-digit PIN to access the arcade.</p><div className="gate-art" aria-hidden="true"><img src="/golden-spatula-logo.png" alt="" /><span>✦ CROSSWORDS &nbsp; ✦ PUZZLE</span></div></div>
      <div className="gate-card"><span className="overline">WELCOME TO THE ARCADE</span><h2>{mode === "register" ? "Create your entry." : "Welcome back."}</h2><p>{mode === "register" ? "First time here? Add your name, register your Game ID, and make a PIN." : "Enter your name, Game ID, and PIN. Your name will appear with your Discord score."}</p>
        <div className="entry-tabs" role="tablist" aria-label="Entry mode"><button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); setPin(""); setConfirmPin(""); }}>CREATE ENTRY</button><button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); setPin(""); setConfirmPin(""); }}>SIGN IN</button></div>
        <form className="entry-form" onSubmit={enter}>
          <label htmlFor="player-name">NAME</label><input id="player-name" name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name shown with your score" maxLength={32} autoComplete="nickname" required />
          <label htmlFor="game-id">GAME ID</label><input id="game-id" name="gameId" value={gameId} onChange={(event) => setGameId(event.target.value)} placeholder="Your Golden Spatula Game ID" maxLength={32} autoComplete="username" required />
          <label htmlFor="entry-pin">{mode === "register" ? "CREATE A 4-DIGIT PIN" : "YOUR 4-DIGIT PIN"}</label><input id="entry-pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" autoComplete={mode === "register" ? "new-password" : "current-password"} required />
          {mode === "register" && <><label htmlFor="confirm-pin">CONFIRM PIN</label><input id="confirm-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" autoComplete="new-password" required /></>}
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "CHECKING ENTRY…" : mode === "register" ? "CREATE ENTRY & PLAY →" : "ENTER THE ARCADE →"}</button>
        </form>
        <p className="gate-note">Your name, Game ID, and a protected PIN hash are saved in the arcade sheet. Keep your PIN private; it cannot be displayed or recovered. Your entry lasts 24 hours.</p>
      </div>
    </section>
    <footer><span className="brand"><img className="brand-logo" src="/golden-spatula-logo.png" alt="Golden Spatula" /> <strong>ARCADE</strong></span><nav className="footer-links" aria-label="Legal"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav></footer>
  </main>;
}
