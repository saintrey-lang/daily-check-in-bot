"use client";

import { useCallback, useEffect, useState } from "react";
import { STARPLAYER_CATEGORIES, STARPLAYER_SHEET_ID, type StarplayerCategory, type StarplayerSubmission } from "@/lib/starplayer/core";

type Summary = {
  totalSubmissions: number;
  uniquePlayers: number;
  completedTasks: number;
  categories: Array<{ id: StarplayerCategory; label: string; submissions: number; players: number }>;
  players: Array<{
    userId: string; username: string; displayName: string;
    categories: StarplayerCategory[]; submissions: number; latestAt: string;
  }>;
  recent: StarplayerSubmission[];
  sheetUrl: string;
};

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

function submittedAt(value: string): string {
  return value ? `${value.replace("T", " ").slice(0, 16)} UTC` : "—";
}

export default function StarplayerDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/starplayer/status", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load Starplayer submissions.");
    setSummary(result as Summary);
    setError("");
  }, []);

  useEffect(() => {
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load Starplayer submissions."));
    const timer = window.setInterval(() => { void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh Starplayer submissions.")); }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return <section className="starplayer">
    <div className="section-head starplayer-heading"><div>
      <span className="eyebrow">STARPLAYER TASKS</span>
      <h2>Submission tracker</h2>
      <p>Category completion means a player has submitted at least one task in that category.</p>
    </div><a className="sheet-link" href={summary?.sheetUrl ?? `https://docs.google.com/spreadsheets/d/${STARPLAYER_SHEET_ID}/edit`} target="_blank" rel="noreferrer">Open Starplayer Sheet ↗</a></div>
    {error && <div className="error banner" role="alert">{error}</div>}
    {!summary ? <div className="loading">Loading Starplayer submissions…</div> : <>
      <div className="starplayer-totals">
        <div className="stat"><span className="eyebrow">TOTAL SUBMISSIONS</span><b>{summary.totalSubmissions}</b><p>Every recorded entry</p></div>
        <div className="stat"><span className="eyebrow">STARPLAYERS</span><b>{summary.uniquePlayers}</b><p>Unique submitters</p></div>
        <div className="stat"><span className="eyebrow">TASKS FINISHED</span><b>{summary.completedTasks}</b><p>Unique player and category pairs</p></div>
      </div>
      <div className="starplayer-categories">{summary.categories.map((category) => <div className="category-card" key={category.id}>
        <span className="eyebrow">{category.label.toUpperCase()}</span>
        <strong>{category.players} <small>players finished</small></strong>
        <span>{category.submissions} submissions</span>
      </div>)}</div>
      <div className="starplayer-panel"><div className="panel-head"><h3>Player progress</h3><span>{summary.uniquePlayers} players</span></div>
        {summary.players.length ? <div className="table-scroll"><table><thead><tr><th>Starplayer</th>{STARPLAYER_CATEGORIES.map((category) => <th key={category.id}>{category.label}</th>)}<th>Total submissions</th></tr></thead><tbody>
          {summary.players.map((player) => <tr key={player.userId}><td><strong>{player.displayName || player.username}</strong><small>@{player.username}</small></td>
            {STARPLAYER_CATEGORIES.map((category) => <td key={category.id}><span className={`task-mark ${player.categories.includes(category.id) ? "done" : ""}`}>{player.categories.includes(category.id) ? "✓ Finished" : "—"}</span></td>)}
            <td>{player.submissions}</td></tr>)}
        </tbody></table></div> : <p className="empty-state">No submissions yet. Players can use the pinned category dropdown in the submission channel.</p>}
      </div>
      <div className="starplayer-panel"><div className="panel-head"><h3>Recent submissions</h3><span>Latest 50</span></div>
        {summary.recent.length ? <div className="table-scroll"><table><thead><tr><th>Submitted</th><th>Starplayer</th><th>Category</th><th>Submission</th></tr></thead><tbody>
          {summary.recent.map((entry) => <tr key={entry.id}><td>{submittedAt(entry.submittedAt)}</td><td>{entry.displayName || entry.username}</td><td>{STARPLAYER_CATEGORIES.find((category) => category.id === entry.category)?.label}</td><td className="submission-links">
            {safeLink(entry.link) && <a href={safeLink(entry.link)!} target="_blank" rel="noreferrer">Open link ↗</a>}
            {entry.attachmentName && safeLink(entry.messageUrl) && <a href={safeLink(entry.messageUrl)!} target="_blank" rel="noreferrer">{entry.attachmentName} ↗</a>}
          </td></tr>)}
        </tbody></table></div> : <p className="empty-state">No submissions recorded yet.</p>}
      </div>
    </>}
  </section>;
}
