"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CheckinConfig, CheckinWindow, EmbedTemplate } from "@/lib/checkin/core";

type Status = {
  config: CheckinConfig; window: CheckinWindow | null;
  prompt: { messageId: string; revision: string } | null;
  today: number; total: number;
};
type Editor = { title: string; description: string; color: string; assetId: string | null; remove: boolean };

function preview(content: string, status: Status | null) {
  const day = status?.window?.day ?? 1;
  const values: Record<string, string> = {
    day: String(day), code: status?.window?.code ?? "MONDAY", daysLeft: String(15 - day),
    streak: "1", milestone: "4", timezone: status?.config.timeZone ?? "Asia/Manila",
  };
  return content.replace(/\{(day|code|daysLeft|streak|milestone|timezone)\}/g, (_, key: string) => values[key]);
}

function EmbedEditor({ label, prefix, value, onChange, status }: {
  label: string; prefix: "prompt" | "success"; value: Editor;
  onChange: (editor: Editor) => void; status: Status;
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
      <p className="hint">Use <code>{"{day}"}</code>, <code>{"{code}"}</code>, <code>{"{daysLeft}"}</code>, <code>{"{streak}"}</code>, and <code>{"{timezone}"}</code> to insert live values.</p>
    </div>
    <div className="preview-wrap"><span className="eyebrow">LIVE PREVIEW</span><div className="discord-preview" style={{ borderLeftColor: value.color }}>
      <strong>{preview(value.title, status)}</strong>
      <p>{preview(value.description, status)}</p>
      {prefix === "prompt" && <small>DAILY CODE · {status.window?.code ?? "MONDAY"}</small>}
      {prefix === "success" && <small>Day {status.window?.day ?? 1}/15 · milestone at 4, 7 and 15</small>}
    </div></div>
  </article>;
}

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [prompt, setPrompt] = useState<Editor | null>(null);
  const [success, setSuccess] = useState<Editor | null>(null);
  const [timeZone, setTimeZone] = useState("");
  const [codes, setCodes] = useState("");
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
      setTimeZone(config.timeZone); setCodes(config.codes.join(", "));
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load dashboard."));
    const timer = window.setInterval(() => { void refresh().catch(() => {}); }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError(""); setNotification("");
    try {
      const body = new FormData(event.currentTarget);
      const response = await fetch("/api/settings", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Save failed.");
      if (form.current) form.current.reset();
      await refresh(true);
      setNotification("Embeds and codes saved. The current daily announcement will update when the bot syncs.");
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
      setNotification("Day 1 started. The bot will post the MONDAY code in the channel shortly.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Start failed."); }
    finally { setWorking(false); }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const active = Boolean(status?.window);
  const phase = !status?.config.startedAt ? "DRAFT" : active ? status?.prompt ? "LIVE" : "WAITING FOR BOT" : "COMPLETE";
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">✦</span><div><b>DAYMARK</b><small>CHECK-IN STUDIO</small></div></div>
      <nav><a className="nav-active" href="#overview"><span>◫</span> Overview</a><a href="#messages"><span>✎</span> Embed messages</a><a href="#schedule"><span>◷</span> Daily codes</a>{status && <a href={`https://docs.google.com/spreadsheets/d/${status.config.sheetId}/edit`} target="_blank" rel="noreferrer"><span>▤</span> Check-in Sheet ↗</a>}</nav>
      <div className="sidebar-bottom"><span className="bot-dot" /> Discord check-in bot<br /><button type="button" onClick={logout}>Sign out ↗</button></div>
    </aside>
    <main className="content" id="overview">
      <header className="topbar"><span className="breadcrumb">EVENTS <span>/</span> DAILY CHECK-IN</span><span className="topbar-right">15-DAY CAMPAIGN <span className="avatar">GS</span></span></header>
      <div className="content-inner">
        <section className="intro"><span className="eyebrow">EVENT CONTROL CENTER</span><div className="intro-row"><div><h1>Daily Check-In <span>✦</span></h1><p>Shape the message. Set the code. Let the streak begin.</p></div><span className={`status-pill ${phase === "LIVE" ? "live" : ""}`}><span /> {phase}</span></div></section>
        {notification && <div className="notice" role="status">{notification}</div>}
        {error && <div className="error banner" role="alert">{error}</div>}
        {!status || !prompt || !success ? <div className="loading">Loading your check-in workspace…</div> : <>
          <section className="stats-grid">
            <div className="stat"><span className="eyebrow">CURRENT DAY</span><b>{status.window ? String(status.window.day).padStart(2, "0") : "—"} <small>/ 15</small></b><p>Resets daily at 8:00 AM</p></div>
            <div className="stat"><span className="eyebrow">TODAY'S CODE</span><b className="code-stat">{status.window?.code ?? "MONDAY"}</b><p>Accepted without case sensitivity</p></div>
            <div className="stat"><span className="eyebrow">CHECK-INS TODAY</span><b>{status.today}</b><p>{status.total} recorded for this run</p></div>
          </section>
          <section className="launch" id="schedule"><div><span className="eyebrow">EVENT SCHEDULE</span><h2>{active ? "Your check-in is running" : "Ready when you are"}</h2><p>{active ? status.prompt ? "The daily code is live in Discord." : "The event is open; waiting for the bot to post today's code." : "Press Start to post Day 1 with the MONDAY code. Each following day begins at 8:00 AM in the selected timezone."}</p>
            <div className="details"><span>Discord channel <strong>#{status.config.channelId}</strong></span><span>Sheet <a href={`https://docs.google.com/spreadsheets/d/${status.config.sheetId}/edit`} target="_blank" rel="noreferrer">Open tracking Sheet ↗</a></span></div></div>
            {!active && <button type="button" className="primary start-button" disabled={working} onClick={start}>{working ? "Working…" : status.config.startedAt ? "Start a new run ↗" : "Start Day 1 ↗"}</button>}
          </section>
          <section className="section-head" id="messages"><div><span className="eyebrow">MESSAGE BUILDER</span><h2>Make every check-in feel like a win.</h2><p>Customize the daily announcement and the player's verified reply. Attach an image or PDF to either message.</p></div></section>
          <form ref={form} onSubmit={save}>
            <input type="hidden" name="revision" value={status.config.revision} />
            <div className="editors"><EmbedEditor label="Daily announcement" prefix="prompt" value={prompt} onChange={setPrompt} status={status} /><EmbedEditor label="Verified reply" prefix="success" value={success} onChange={setSuccess} status={status} /></div>
            <section className="schedule-card"><div><span className="eyebrow">DAILY RESET</span><h3>Codes & timezone</h3><p>Day 1 always starts with MONDAY. Enter 15 codes, separated by commas. The bot posts each new code at 8:00 AM.</p></div><div className="schedule-fields"><label className="field-label">Timezone<input name="timeZone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required disabled={active} /></label><label className="field-label">15-day code sequence<textarea name="codes" rows={3} value={codes} onChange={(event) => setCodes(event.target.value)} required /></label></div></section>
            <div className="save-bar"><span>Changes to the current announcement sync when the bot is connected.</span><button className="primary" disabled={working}>{working ? "Saving…" : "Save changes ↗"}</button></div>
          </form>
        </>}
      </div>
    </main>
  </div>;
}
