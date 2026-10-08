"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { StatsConfig, StatsSummary } from "@/lib/stats/core";

type StatsResponse = {
  seven: StatsSummary; thirty: StatsSummary; config: StatsConfig; lastReport: string; sheetUrl: string;
};

function hours(seconds: number): string { return `${(seconds / 3_600).toFixed(1)}h`; }

export default function ServerStatsDashboard() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [config, setConfig] = useState<StatsConfig | null>(null);
  const [period, setPeriod] = useState<"seven" | "thirty">("seven");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/stats", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load server statistics.");
    setData(result as StatsResponse);
    setConfig((current) => current ?? (result as StatsResponse).config);
    setError("");
  }, []);

  useEffect(() => {
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load server statistics."));
    const timer = window.setInterval(() => { void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh statistics.")); }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the report schedule.");
      setConfig(result.config as StatsConfig);
      await refresh();
      setNotice(config.channelId ? "Report schedule saved. The worker will post in your chosen channel when the next report is due." : "Scheduled Discord reports paused. Tracking continues in the dashboard.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the report schedule."); }
    finally { setSaving(false); }
  }

  const summary = data?.[period];
  return <section className="server-stats">
    <div className="section-head starplayer-heading"><div>
      <span className="eyebrow">DISCORD SERVER</span><h2>Community statistics</h2>
      <p>Message and voice activity counted from when this worker started tracking. Bot messages are excluded.</p>
    </div>{data && <a className="sheet-link" href={data.sheetUrl} target="_blank" rel="noreferrer">Open tracking Sheet ↗</a>}</div>
    {error && <div className="error banner" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {!data || !summary || !config ? <div className="loading">Loading server statistics…</div> : <>
      <div className="stats-period" role="group" aria-label="Statistics period">
        <button type="button" aria-pressed={period === "seven"} onClick={() => setPeriod("seven")}>Last 7 days</button>
        <button type="button" aria-pressed={period === "thirty"} onClick={() => setPeriod("thirty")}>Last 30 days</button>
        <span>{summary.start} to {summary.end} · {config.timeZone}</span>
      </div>
      <div className="stats-grid">
        <div className="stat"><span className="eyebrow">MESSAGES</span><b>{summary.messages.toLocaleString()}</b><p>Member messages in visible channels</p></div>
        <div className="stat"><span className="eyebrow">VOICE TIME</span><b>{hours(summary.voiceSeconds)}</b><p>Time in server voice channels</p></div>
        <div className="stat"><span className="eyebrow">ACTIVE MEMBERS</span><b>{summary.activeMembers.toLocaleString()}</b><p>Members who sent a message or joined voice</p></div>
      </div>
      <div className="stats-tables">
        <div className="starplayer-panel"><div className="panel-head"><h3>Member drilldown</h3><span>{summary.members.length} active</span></div>
          <div className="table-scroll"><table><thead><tr><th>Member</th><th>Messages</th><th>Voice</th></tr></thead><tbody>
            {summary.members.slice(0, 100).map((member) => <tr key={member.id}><td>{member.name || member.id}</td><td>{member.messages.toLocaleString()}</td><td>{hours(member.voiceSeconds)}</td></tr>)}
          </tbody></table></div>{!summary.members.length && <p className="empty-state">No activity recorded for this period.</p>}</div>
        <div className="starplayer-panel"><div className="panel-head"><h3>Channel drilldown</h3><span>{summary.channels.length} active</span></div>
          <div className="table-scroll"><table><thead><tr><th>Channel</th><th>Messages</th><th>Voice</th></tr></thead><tbody>
            {summary.channels.slice(0, 100).map((channel) => <tr key={channel.id}><td>#{channel.name || channel.id}</td><td>{channel.messages.toLocaleString()}</td><td>{hours(channel.voiceSeconds)}</td></tr>)}
          </tbody></table></div>{!summary.channels.length && <p className="empty-state">No channel activity recorded for this period.</p>}</div>
      </div>
      <div className="starplayer-panel"><div className="panel-head"><h3>Daily activity</h3><span>{period === "seven" ? 7 : 30} days</span></div>
        <div className="table-scroll"><table><thead><tr><th>Date</th><th>Messages</th><th>Voice</th></tr></thead><tbody>
          {[...summary.daily].reverse().map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.messages.toLocaleString()}</td><td>{hours(day.voiceSeconds)}</td></tr>)}
        </tbody></table></div></div>
      <form className="stats-settings starplayer-panel" onSubmit={save}>
        <div className="panel-head"><h3>Discord report schedule</h3><span>{data.lastReport ? `Last report: ${data.lastReport}` : "No reports posted yet"}</span></div>
        <div className="stats-settings-fields">
          <label className="field-label">Report channel ID
            <input inputMode="numeric" pattern="[0-9]{17,20}" placeholder="Paste a Discord channel ID" value={config.channelId} onChange={(event) => setConfig({ ...config, channelId: event.target.value.trim() })} />
          </label>
          <label className="field-label">Frequency
            <select value={config.frequency} onChange={(event) => setConfig({ ...config, frequency: event.target.value as StatsConfig["frequency"] })}>
              <option value="weekly">Weekly · Monday</option><option value="daily">Daily</option>
            </select>
          </label>
          <label className="field-label">Time · {config.timeZone}
            <input type="time" required value={config.time} onChange={(event) => setConfig({ ...config, time: event.target.value })} />
          </label>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save report schedule ↗"}</button>
        </div>
        <p>Leave the channel ID blank to pause Discord posts. The bot needs View Channel, Send Messages, Embed Links, and Read Message History there.</p>
      </form>
      <p className="stats-note">Status, game activity, and invite attribution need additional Discord permissions and are not counted in this report.</p>
    </>}
  </section>;
}
