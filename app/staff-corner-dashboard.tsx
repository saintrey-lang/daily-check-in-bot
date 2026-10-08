"use client";

import { useCallback, useEffect, useState } from "react";
import { type DailyRecord, type QuotaStatus, type RosterState, type StaffPerformance, type WeekendRecord } from "@/lib/staff/core";

type StaffResponse = {
  staff: StaffPerformance[]; pins: string[]; rosterState: RosterState;
  roleIds: string[]; roles: Array<{ id: string; name: string }>; start: string; end: string; today: string; timeZone: string;
  earliest: string;
  targets: { daily: number; weekend: number };
};

function mark(status: QuotaStatus) {
  return <span className={`quota-mark quota-${status}`}>
    {status === "success" ? "SUCCESS" : status === "failure" ? "FAILURE" : status === "in_progress" ? "IN PROGRESS" : "NOT STARTED"}
  </span>;
}

function order(staff: StaffPerformance[], pins: string[]) {
  return [...staff].map((member) => ({ ...member, pinned: pins.includes(member.id) }))
    .sort((a, b) => (pins.indexOf(a.id) < 0 ? 99 : pins.indexOf(a.id)) - (pins.indexOf(b.id) < 0 ? 99 : pins.indexOf(b.id)) ||
      b.selectedMessages - a.selectedMessages || a.name.localeCompare(b.name));
}

export default function StaffCornerDashboard() {
  const [data, setData] = useState<StaffResponse | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const response = await fetch(`/api/staff?${params}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load Staff Corner.");
    setData(result as StaffResponse);
    setError("");
  }, [start, end]);

  useEffect(() => {
    void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load Staff Corner."));
    const timer = window.setInterval(() => { void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh Staff Corner.")); }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function togglePin(id: string) {
    if (!data || savingPin) return;
    const pins = data.pins.includes(id) ? data.pins.filter((value) => value !== id) : [...data.pins, id];
    if (pins.length > 10) { setError("You can pin up to 10 staff members. Unpin someone first."); return; }
    setSavingPin(true); setError("");
    try {
      const response = await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pins }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save pinned staff.");
      setData((current) => current && ({ ...current, pins: result.pins as string[], staff: order(current.staff, result.pins as string[]) }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save pinned staff."); }
    finally { setSavingPin(false); }
  }

  const visible = data?.staff.filter((member) => `${member.name} ${member.id}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const selected = visible.find((member) => member.id === selectedId) ?? visible[0] ?? null;
  const rosterComplete = data?.rosterState.status === "complete";
  const todayRecord = (member: StaffPerformance) => member.daily.find((day) => day.date === data?.today);
  return <section className="staff-corner">
    <div className="section-head"><span className="eyebrow">TEAM ACTIVITY</span><h2>Staff Corner</h2>
      <p>Track staff messages across channels the bot can read. Daily and weekend quotas use {data?.timeZone || "Asia/Manila"} dates.</p></div>
    {error && <div className="error banner" role="alert">{error}</div>}
    {!data ? <div className="loading">Loading staff activity…</div> : <>
      {!rosterComplete && <div className="stats-history" role="status">
        {data.rosterState.status === "needs_members_intent" ?
          "Partial staff list: Discord Guild Members intent is needed to list every holder of the two roles, including people with no messages. Showing observed staff for now." :
          data.rosterState.status === "error" ? "The last full roster refresh failed. The saved staff list may be out of date." :
            "The staff roster is being prepared. Only observed staff may appear until the first full sync."}
      </div>}
      {rosterComplete && <div className="staff-sync">Full role roster · {data.staff.length} staff · synced {new Date(data.rosterState.syncedAt).toLocaleString()}</div>}
      <div className="staff-overview">
        <div className="stat"><span className="eyebrow">STAFF LISTED</span><b>{data.staff.length}</b><p>From {data.roleIds.map((id) => data.roles.find((role) => role.id === id)?.name || id).join(" + ")}</p></div>
        <div className="stat"><span className="eyebrow">DAILY TARGET</span><b>{data.targets.daily}</b><p>Messages per staff member, each Manila day</p></div>
        <div className="stat"><span className="eyebrow">WEEKEND TARGET</span><b>{data.targets.weekend}</b><p>Combined Saturday and Sunday, plus each day's target</p></div>
        <div className="stat"><span className="eyebrow">PINNED</span><b>{data.pins.length}<small> / 10</small></b><p>Pinned staff appear first</p></div>
      </div>
      <div className="staff-filters">
        <label className="field-label">Daily detail from<input type="date" value={start || data.start} min={data.earliest} max={end || data.end} onChange={(event) => {
          const next = event.target.value; setStart(next); if (next > (end || data.end)) setEnd(next);
        }} /></label>
        <label className="field-label">Through<input type="date" value={end || data.end} min={start || data.start} max={data.today} onChange={(event) => setEnd(event.target.value)} /></label>
        <label className="field-label staff-filter-search">Find staff by name or Discord ID<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff" /></label>
      </div>
      <div className="starplayer-panel">
        <div className="panel-head"><h3>Staff performance</h3><span>{visible.length} shown · {data.start} to {data.end}</span></div>
        <div className="table-scroll staff-table"><table><thead><tr><th>Staff</th><th>Today / 50</th><th>Latest weekend / 145</th><th>Success</th><th>Failure</th><th>Pin</th></tr></thead><tbody>
          {visible.map((member) => {
            const today = todayRecord(member);
            const weekend = member.currentWeekend ?? member.weekends[0];
            return <tr key={member.id} className={selected?.id === member.id ? "staff-selected" : ""}>
              <td><button type="button" className="staff-name" onClick={() => setSelectedId(member.id)}>{member.pinned && <span aria-label="Pinned">★ </span>}{member.name}<small>{member.id}</small><small>{member.roleIds.map((id) => data.roles.find((role) => role.id === id)?.name || id).join(" · ")}</small></button></td>
              <td><strong>{member.todayMessages}</strong>{today && mark(today.status)}</td>
              <td><strong>{weekend?.messages ?? "—"}</strong>{weekend && mark(weekend.status)}</td>
              <td className="staff-success">{member.success}</td><td className="staff-failure">{member.failure}</td>
              <td><button type="button" className="staff-pin" aria-label={`${member.pinned ? "Unpin" : "Pin"} ${member.name}`} aria-pressed={member.pinned} disabled={savingPin || (!member.pinned && data.pins.length >= 10)} onClick={() => void togglePin(member.id)}>{member.pinned ? "Unpin" : "Pin"}</button></td>
            </tr>;
          })}
        </tbody></table></div>
        {!visible.length && <p className="empty-state">No staff match this search or roster yet.</p>}
      </div>
      {selected && <div className="staff-detail starplayer-panel">
        <div className="panel-head"><div><h3>{selected.name}</h3><span>{selected.id} · quota starts {selected.quotaStart}</span></div><span>{selected.selectedMessages.toLocaleString()} messages in selected dates</span></div>
        <div className="staff-totals">
          <div><span className="eyebrow">TOTAL SUCCESS</span><b>{selected.success}</b><small>{selected.dailySuccess} daily · {selected.weekendSuccess} weekend</small></div>
          <div><span className="eyebrow">TOTAL FAILURE</span><b>{selected.failure}</b><small>{selected.dailyFailure} daily · {selected.weekendFailure} weekend</small></div>
          <div><span className="eyebrow">TODAY</span><b>{selected.todayMessages} <small>/ 50</small></b><small>{todayRecord(selected)?.remark ?? "Quota has not started"}</small></div>
        </div>
        <div className="staff-ledgers">
          <div><h4>Daily quota</h4><div className="table-scroll"><table><thead><tr><th>Date</th><th>Messages</th><th>Mark</th><th>Remarks</th></tr></thead><tbody>
            {selected.daily.map((day: DailyRecord) => <tr key={day.date}><td>{day.date}</td><td>{day.messages} / {day.target}</td><td>{mark(day.status)}</td><td>{day.remark}</td></tr>)}
          </tbody></table></div>{!selected.daily.length && <p className="empty-state">No days in this range.</p>}</div>
          <div><h4>Weekend quota</h4><div className="table-scroll"><table><thead><tr><th>Sat–Sun</th><th>Messages</th><th>Mark</th><th>Remarks</th></tr></thead><tbody>
            {selected.weekends.map((weekend: WeekendRecord) => <tr key={weekend.start}><td>{weekend.start}<small>to {weekend.end}</small></td><td>{weekend.messages} / {weekend.target}</td><td>{mark(weekend.status)}</td><td>{weekend.remark}</td></tr>)}
          </tbody></table></div>{!selected.weekends.length && <p className="empty-state">No weekends in this range yet.</p>}</div>
        </div>
      </div>}
      <p className="stats-note">Daily failures are marked after midnight; weekend failures after Sunday ends. A new staff member's quota begins the day after their role is first observed or synced. Success and failure totals include completed daily and weekend goals since that date. Historical counts depend on the ongoing Discord message import.</p>
    </>}
  </section>;
}
