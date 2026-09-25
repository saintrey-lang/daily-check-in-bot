"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatResetTime, localDateAt, type CheckinConfig, type CheckinWindow, type EmbedTemplate } from "@/lib/checkin/core";
import StarplayerDashboard from "./starplayer-dashboard";

type Status = {
  config: CheckinConfig; window: CheckinWindow | null;
  prompt: { messageId: string; revision: string } | null;
  today: number; total: number;
  resetTimeToday: string; pendingTimeChangeDate: string | null;
};
type Editor = { title: string; description: string; color: string; assetId: string | null; remove: boolean };

function preview(content: string, status: Status, code: string, resetTime: string) {
  const day = status.window?.day ?? 1;
  const values: Record<string, string> = {
    day: String(day), code, daysLeft: String(15 - day),
    streak: "1", milestone: "4", timezone: status.config.timeZone, resetTime: formatResetTime(resetTime),
  };
  return content.replace(/\{(day|code|daysLeft|streak|milestone|timezone|resetTime)\}/g, (_, key: string) => values[key]);
}

function EmbedEditor({ label, prefix, value, onChange, status, code, resetTime }: {
  label: string; prefix: "prompt" | "success"; value: Editor;
  onChange: (editor: Editor) => void; status: Status; code: string; resetTime: string;
}) {
  const file = useRef<HTMLInputElement>(null);
  const set = (field: keyof Editor, next: string | boolean) => onChange({ ...value, [field]: next });
  return <article className="editor-card">
    <div className="editor-head"><div><span className="eyebrow">{prefix === "prompt" ? "POSTED BY THE BOT" : "SENT TO EACH PLAYER"}</span><h3>{label}</h3></div><span className="editor-icon">{prefix === "prompt" ? "↗" : "✓"}</span></div>
    <div className="editor-fields">
      <label className="field-label">Embed title
        <input name={`${prefix}Title`} value={value.title} maxLength={256} onChange={(event) => set("title", event.target.value)} required />
      </label>
      <label className="field-label">Embed message
        <textarea name={`${prefix}Description`} value={value.description} maxLength={3500} rows={5} onChange={(event) => set("description", event.target.value)} required />
      </label>
      <div className="two-cols">
        <label className="field-label">Accent color
          <input name={`${prefix}Color`} type="color" value={value.color} onChange={(event) => set("color", event.target.value)} />
        </label>
        <label className="field-label">Attach a file <span className="muted">(up to 1 MB)</span>
          <input ref={file} name={`${prefix}File`} type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" onChange={() => set("remove", false)} />
        </label>
      </div>
      <input type="hidden" name={`${prefix}Remove`} value={value.remove ? "true" : "false"} />
      {value.assetId && !value.remove && <div className="asset-line">
        <a href={`/api/asset/${value.assetId}`} target="_blank" rel="noreferrer">View attached file ↗</a>
        <button type="button" className="text-button" onClick={() => { if (file.current) file.current.value = ""; set("remove", true); }}>Remove</button>
      </div>}
      <p className="hint">Use <code>{"{day}"}</code>, <code>{"{code}"}</code>, <code>{"{daysLeft}"}</code>, <code>{"{streak}"}</code>, <code>{"{resetTime}"}</code>, and <code>{"{timezone}"}</code> to insert live values.</p>
    </div>
    <div className="preview-wrap"><span className="eyebrow">LIVE PREVIEW</span><div className="discord-preview" style={{ borderLeftColor: value.color }}>
      <strong>{preview(value.title, status, code, resetTime)}</strong>
      <p>{preview(value.description, status, code, resetTime)}</p>
      {prefix === "prompt" && <small>DAILY CODE · {code}</small>}
      {prefix === "success" && <small>Day {status.window?.day ?? 1}/15 · milestone at 4, 7 and 15</small>}
    </div></div>
  </article>;
}

export default function Dashboard() {
  const [tab, setTab] = useState<"checkin" | "starplayer">("checkin");
  const [status, setStatus] = useState<Status | null>(null);
  const [prompt, setPrompt] = useState<Editor | null>(null);
  const [success, setSuccess] = useState<Editor | null>(null);
  const [timeZone, setTimeZone] = useState("");
  const [resetTime, setResetTime] = useState("08:00");
  const [codes, setCodes] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState("");
  const [notification, setNotification] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const initialized = useRef(false);

  const refresh = useCallback(async (reset = false) => {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load dashboard.");
    setStatus(data as Status);
    if (!initialized.current || reset) {
      const config = (data as Status).config;
      const editor = (value: EmbedTemplate): Editor => ({ ...value, remove: false });
      setPrompt(editor(config.prompt)); setSuccess(editor(config.success));
      setTimeZone(config.timeZone); setResetTime(config.resetTime); setCodes(config.codes);
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load dashboard."));
    const timer = window.setInterval(() => { void refresh().catch(() => {}); }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const fromHash = () => setTab(window.location.hash === "#starplayer" ? "starplayer" : "checkin");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTab(next: "checkin" | "starplayer") {
    setTab(next);
    window.history.replaceState(null, "", next === "starplayer" ? "#starplayer" : "#daily-check-in");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError(""); setNotification("");
    try {
      const body = new FormData(event.currentTarget);
      const changedTime = resetTime !== status?.config.resetTime;
      const response = await fetch("/api/settings", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Save failed.");
      if (form.current) form.current.reset();
      await refresh(true);
      setNotification(changedTime && active
        ? "Changes saved. The new reset time begins on the next local day; the bot will update today's code and announcement when it syncs."
        : "Codes, reset time, and embeds saved. The bot will update today's announcement when it syncs.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Save failed."); }
    finally { setWorking(false); }
  }

  async function start() {
    setWorking(true); setError(""); setNotification("");
    try {
      const response = await fetch("/api/start", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Start failed.");
      await refresh(true);
      setNotification(`Day 1 started. The bot will post the ${result.code ?? codes[0]} code in the channel shortly.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Start failed."); }
    finally { setWorking(false); }
  }

  async function resetDayOne(date?: string) {
    if (!status) return;
    if (status.total > 0 && !window.confirm(`Start a new run? The ${status.total} check-ins from this run will remain in the Sheet, but the dashboard and bot will track the new run.`)) return;
    setWorking(true); setError(""); setNotification("");
    try {
      const response = await fetch("/api/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: status.config.revision, ...(date ? { scheduledDate: date } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reset Day 1.");
      setScheduledDate("");
      await refresh(true);
      setNotification(date
        ? `Day 1 is scheduled for ${date} at ${formatResetTime(status.config.resetTime)} (${status.config.timeZone}). The bot will post its code when it starts.`
        : `Day 1 is live for today. The bot will post the ${result.code} code shortly.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reset Day 1."); }
    finally { setWorking(false); }
  }

  const active = Boolean(status?.window);
  const scheduled = Boolean(status?.config.startedAt && Date.parse(status.config.startedAt) > Date.now());
  const phase = !status?.config.startedAt ? "DRAFT" : scheduled ? "SCHEDULED" : active ? status?.prompt ? "LIVE" : "WAITING FOR BOT" : "COMPLETE";
  const draftCode = codes[(status?.window?.day ?? 1) - 1] ?? status?.window?.code ?? "";
  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><div><b>GOLDEN SPATULA</b><small>ENCHANTED WILDS</small></div></div>
      <div className="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
        <button id="checkin-tab" type="button" role="tab" aria-controls="checkin-panel" aria-selected={tab === "checkin"} tabIndex={tab === "checkin" ? 0 : -1} onClick={() => selectTab("checkin")} onKeyDown={(event) => { if (event.key === "ArrowRight") { selectTab("starplayer"); document.getElementById("starplayer-tab")?.focus(); } }}>DAILY CHECK-IN</button>
        <span className="tab-divider" aria-hidden="true">|</span>
        <button id="starplayer-tab" type="button" role="tab" aria-controls="starplayer-panel" aria-selected={tab === "starplayer"} tabIndex={tab === "starplayer" ? 0 : -1} onClick={() => selectTab("starplayer")} onKeyDown={(event) => { if (event.key === "ArrowLeft") { selectTab("checkin"); document.getElementById("checkin-tab")?.focus(); } }}>STARPLAYER</button>
      </div>
      <span className="topbar-right">EVENT CONTROL CENTER <span className="avatar">GS</span></span>
    </header>
    <main className="content">
      <div className="campaign-hero"><Image className="campaign-art" src="/enchanted-wilds-banner.jpg" alt="Golden Spatula Enchanted Wilds campaign artwork" fill priority sizes="100vw" /><span className="hero-fade" aria-hidden="true" /></div>
      <div className="content-inner">
        <section id="checkin-panel" role="tabpanel" aria-labelledby="checkin-tab" hidden={tab !== "checkin"}>
        <nav className="section-nav" aria-label="Daily check-in sections"><a href="#overview">Overview</a><a href="#messages">Embed messages</a><a href="#schedule">Codes & time</a>{status && <a href={`https://docs.google.com/spreadsheets/d/${status.config.sheetId}/edit`} target="_blank" rel="noreferrer">Check-in Sheet ↗</a>}</nav>
        <section className="intro" id="overview"><span className="eyebrow">EVENT CONTROL CENTER</span><div className="intro-row"><div><h1>Daily Check-In <span>✦</span></h1><p>Shape the message. Set the code. Let the streak begin.</p></div><span className={`status-pill ${phase === "LIVE" ? "live" : ""}`}><span /> {phase}</span></div></section>
        {notification && <div className="notice" role="status">{notification}</div>}
        {error && <div className="error banner" role="alert">{error}</div>}
        {!status || !prompt || !success ? <div className="loading">Loading your check-in workspace…</div> : <>
          <section className="stats-grid">
            <div className="stat"><span className="eyebrow">CURRENT DAY</span><b>{status.window ? String(status.window.day).padStart(2, "0") : "—"} <small>/ 15</small></b><p>Reset today: {formatResetTime(status.resetTimeToday)} · {status.config.timeZone}</p>{status.pendingTimeChangeDate && <p>New time begins {status.pendingTimeChangeDate}</p>}</div>
            <div className="stat"><span className="eyebrow">TODAY'S CODE</span><b className="code-stat">{status.window?.code ?? status.config.codes[0]}</b><p>Accepted without case sensitivity</p></div>
            <div className="stat"><span className="eyebrow">CHECK-INS TODAY</span><b>{status.today}</b><p>{status.total} recorded for this run</p></div>
          </section>
          <section className="launch"><div><span className="eyebrow">EVENT SCHEDULE</span><h2>{scheduled ? "Day 1 is scheduled" : active ? "Your check-in is running" : "Ready when you are"}</h2><p>{scheduled ? `Day 1 begins ${status.config.startDate} at ${formatResetTime(status.config.resetTime)} (${status.config.timeZone}).` : active ? status.prompt ? "The daily code is live in Discord." : "The event is open; waiting for the bot to post today's code." : `Press Start to post Day 1 with ${status.config.codes[0]}. Each following day begins at ${formatResetTime(status.config.resetTime)} in ${status.config.timeZone}.`}</p>
            <div className="details"><span><a href="#schedule">Edit codes & time ↗</a></span><span>Discord channel <strong>#{status.config.channelId}</strong></span><span>Sheet <a href={`https://docs.google.com/spreadsheets/d/${status.config.sheetId}/edit`} target="_blank" rel="noreferrer">Open tracking Sheet ↗</a></span></div></div>
            {!active && !scheduled && <button type="button" className="primary start-button" disabled={working} onClick={start}>{working ? "Working…" : status.config.startedAt ? "Start a new run ↗" : "Start Day 1 ↗"}</button>}
          </section>
          <section className="day-one-controls" aria-label="Reset or schedule Day 1">
            <div><span className="eyebrow">DAY 1 CONTROL</span><h3>Reset or schedule Day 1</h3><p>Starting a new run keeps earlier check-ins in the Sheet. The bot will close the current announcement and post the new Day 1 code when the run starts.</p></div>
            <div className="day-one-actions">
              <button type="button" className="primary start-button" disabled={working} onClick={() => void resetDayOne()}>{working ? "Working…" : "Reset to Day 1 now ↗"}</button>
              <label className="field-label">Schedule Day 1 date · {status.config.timeZone}
                <input type="date" value={scheduledDate} min={localDateAt(new Date(), status.config.timeZone)} onChange={(event) => setScheduledDate(event.target.value)} />
              </label>
              <button type="button" className="primary" disabled={working || !scheduledDate} onClick={() => void resetDayOne(scheduledDate)}>Schedule at {formatResetTime(status.config.resetTime)} ↗</button>
            </div>
          </section>
          <section className="section-head" id="messages"><div><span className="eyebrow">MESSAGE BUILDER</span><h2>Make every check-in feel like a win.</h2><p>Customize the daily announcement and the player's verified reply. Attach an image or PDF to either message.</p></div></section>
          <form ref={form} onSubmit={save}>
            <input type="hidden" name="revision" value={status.config.revision} />
            <div className="editors"><EmbedEditor label="Daily announcement" prefix="prompt" value={prompt} onChange={setPrompt} status={status} code={draftCode} resetTime={resetTime} /><EmbedEditor label="Verified reply" prefix="success" value={success} onChange={setSuccess} status={status} code={draftCode} resetTime={resetTime} /></div>
            <section className="schedule-card" id="schedule"><div><span className="eyebrow">DAILY RESET</span><h3>Codes & time</h3><p>Set a code for each day and choose when the next day begins. Day 1 starts immediately when you press Start.</p><p>Today's code can change during a run. Reset time changes take effect on the next local calendar day. The timezone stays fixed until the run ends.</p></div><div className="schedule-fields">
              <div className="schedule-time-fields"><label className="field-label">Timezone<input name="timeZone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required readOnly={active} /></label><label className="field-label">Daily reset time<input name="resetTime" type="time" value={resetTime} onChange={(event) => setResetTime(event.target.value)} required /></label></div>
              <span className="eyebrow">CODE FOR EACH DAY</span>
              <div className="codes-grid">{codes.map((code, index) => <label className={`field-label code-field ${status.window?.day === index + 1 ? "current-code" : ""}`} key={index}>Day {index + 1}{status.window?.day === index + 1 ? " · Today" : ""}<input name="codes" value={code} maxLength={32} pattern="[A-Za-z0-9_-]{2,32}" onChange={(event) => setCodes((previous) => previous.map((value, position) => position === index ? event.target.value.toUpperCase() : value))} required /></label>)}</div>
            </div></section>
            <div className="save-bar"><span>Changes to the current announcement sync when the bot is connected.</span><button className="primary" disabled={working}>{working ? "Saving…" : "Save changes ↗"}</button></div>
          </form>
        </>}
        </section>
        <section id="starplayer-panel" role="tabpanel" aria-labelledby="starplayer-tab" hidden={tab !== "starplayer"}><StarplayerDashboard /></section>
      </div>
    </main>
  </div>;
}
