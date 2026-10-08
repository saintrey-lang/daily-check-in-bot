"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { shiftDate, type StatsConfig, type StatsRole, type StatsSummary } from "@/lib/stats/core";

type StatsResponse = {
  summary: StatsSummary; config: StatsConfig; lastReport: string; sheetUrl: string; today: string;
  roles: StatsRole[]; historyPlan: { from: string; until: string } | null;
  memberRoleId: string; memberRoster: StatsSummary["members"];
  historyProgress: { total: number; complete: number; errors: Array<{ channelName: string; error: string }> };
};

function hours(seconds: number): string { return `${(seconds / 3_600).toFixed(1)}h`; }

export default function ServerStatsDashboard() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [config, setConfig] = useState<StatsConfig | null>(null);
  const [period, setPeriod] = useState<"seven" | "thirty" | "custom" | "all">("seven");
  const [asOf, setAsOf] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [roleId, setRoleId] = useState("");
  const [memberRoleId, setMemberRoleId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ period });
    if (period === "custom") {
      if (customStart) params.set("start", customStart);
      if (customEnd) params.set("end", customEnd);
    } else if (asOf) params.set("end", asOf);
    if (roleId) params.set("roleId", roleId);
    if (memberRoleId) params.set("memberRoleId", memberRoleId);
    const response = await fetch(`/api/stats?${params}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load server statistics.");
    setData(result as StatsResponse);
    setConfig((current) => current ?? (result as StatsResponse).config);
    setAsOf((current) => current || (result as StatsResponse).today);
    setCustomStart((current) => current || (result as StatsResponse).today);
    setCustomEnd((current) => current || (result as StatsResponse).today);
    setError("");
  }, [period, asOf, customStart, customEnd, roleId, memberRoleId]);

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

  const summary = data?.summary;
  const memberSource = memberRoleId ? (data?.memberRoleId === memberRoleId ? data.memberRoster : []) : summary?.members ?? [];
  const members = memberSource.filter((member) => `${member.name} ${member.id}`.toLowerCase().includes(memberQuery.trim().toLowerCase()));
  const channels = summary?.channels.filter((channel) => `${channel.name} ${channel.id}`.toLowerCase().includes(channelQuery.trim().toLowerCase())) ?? [];
  return <section className="server-stats">
    <div className="section-head starplayer-heading"><div>
      <span className="eyebrow">DISCORD SERVER</span><h2>Community statistics</h2>
      <p>Messages include bot activity. Historical messages are being imported where the bot can read channel history; voice time begins when tracking started.</p>
    </div>{data && <a className="sheet-link" href={data.sheetUrl} target="_blank" rel="noreferrer">Open tracking Sheet ↗</a>}</div>
    {error && <div className="error banner" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {!data || !summary || !config ? <div className="loading">Loading server statistics…</div> : <>
      <div className="stats-period" role="group" aria-label="Statistics period">
        <button type="button" aria-pressed={period === "seven"} onClick={() => setPeriod("seven")}>Last 7 days</button>
        <button type="button" aria-pressed={period === "thirty"} onClick={() => setPeriod("thirty")}>Last 30 days</button>
        <button type="button" aria-pressed={period === "custom"} onClick={() => setPeriod("custom")}>Custom date</button>
        <button type="button" aria-pressed={period === "all"} onClick={() => setPeriod("all")}>Since server creation</button>
      </div>
      <div className="stats-filters">
        {period === "custom" ? <>
          <label className="field-label">From <input type="date" value={customStart} min={data.historyPlan?.from} max={customEnd || data.today} onChange={(event) => setCustomStart(event.target.value)} /></label>
          <label className="field-label">To <input type="date" value={customEnd} min={customStart || data.historyPlan?.from} max={data.today} onChange={(event) => setCustomEnd(event.target.value)} /></label>
        </> : <label className="field-label">View through <input type="date" value={asOf} min={data.historyPlan?.from} max={data.today} onChange={(event) => setAsOf(event.target.value)} /></label>}
        <label className="field-label">Role
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            <option value="">All roles</option>
            {data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <span className="stats-range">{summary.start} to {summary.end} · {config.timeZone}</span>
      </div>
      {data.historyPlan && <div className="stats-history" role="status">
        Server history import: {data.historyProgress.complete} of {data.historyProgress.total} accessible channels completed
        {data.historyProgress.total > 0 && data.historyProgress.complete === data.historyProgress.total ? " · Complete" : " · In progress"}.
        Coverage target: {data.historyPlan.from} to {shiftDate(data.historyPlan.until, -1)}.
        {data.historyProgress.errors.length > 0 && <> {data.historyProgress.errors.length} channel(s) need attention; see the ServerStatsHistoryState Sheet tab.</>}
      </div>}
      <div className="stats-grid">
        <div className="stat"><span className="eyebrow">MESSAGES</span><b>{summary.messages.toLocaleString()}</b><p>Includes {summary.botMessages.toLocaleString()} bot messages in visible channels</p></div>
        <div className="stat"><span className="eyebrow">VOICE TIME</span><b>{hours(summary.voiceSeconds)}</b><p>Time in server voice channels</p></div>
        <div className="stat"><span className="eyebrow">ACTIVE ACCOUNTS</span><b>{summary.activeMembers.toLocaleString()}</b><p>Accounts that sent a message or joined voice</p></div>
      </div>
      <div className="stats-tables">
        <div className="starplayer-panel"><div className="panel-head"><h3>Member drilldown</h3><span>{members.length} results</span></div>
          <label className="stats-search">Filter players by role
            <select value={memberRoleId} onChange={(event) => setMemberRoleId(event.target.value)}>
              <option value="">All active accounts</option>
              {data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <label className="stats-search">Search member name or Discord ID<input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search a user or paste their ID" /></label>
          {memberRoleId && <p className="stats-member-note">Shows players observed with this role, including 0 for those idle during these dates. Members the bot has never observed are not in this list.</p>}
          <div className="table-scroll"><table><thead><tr><th>Member</th><th>Messages</th><th>Voice</th></tr></thead><tbody>
            {(memberRoleId || memberQuery ? members : members.slice(0, 100)).map((member) => <tr key={member.id}><td>{member.name || member.id}{member.isBot && <b className="bot-label">BOT</b>}<small>{member.id}</small></td><td>{member.messages.toLocaleString()}</td><td>{hours(member.voiceSeconds)}</td></tr>)}
          </tbody></table></div>{!members.length && <p className="empty-state">{memberRoleId ? "No tracked players match this role and search." : "No matching activity for this period."}</p>}</div>
        <div className="starplayer-panel"><div className="panel-head"><h3>Channel drilldown</h3><span>{channels.length} results</span></div>
          <label className="stats-search">Search channel name or ID<input type="search" value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="Search a channel or paste its ID" /></label>
          <div className="table-scroll"><table><thead><tr><th>Channel</th><th>Messages</th><th>Voice</th></tr></thead><tbody>
            {(channelQuery ? channels : channels.slice(0, 100)).map((channel) => <tr key={channel.id}><td>#{channel.name || channel.id}<small>{channel.id}</small></td><td>{channel.messages.toLocaleString()}</td><td>{hours(channel.voiceSeconds)}</td></tr>)}
          </tbody></table></div>{!channels.length && <p className="empty-state">No matching channel activity for this period.</p>}</div>
      </div>
      <div className="starplayer-panel"><div className="panel-head"><h3>Daily activity</h3><span>{summary.daily.length} days</span></div>
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
      <p className="stats-note">Role filtering uses roles observed when activity was collected or imported. It cannot reproduce past role changes. Historical voice time is unavailable; deleted or inaccessible messages and some bot messages on the initial import cutoff day cannot be recovered. Status, game activity, and invite attribution are not counted.</p>
    </>}
  </section>;
}
