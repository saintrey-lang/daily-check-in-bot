"use client";

import { useEffect, useState } from "react";
import { shiftDate } from "@/lib/stats/core";
import { type ChannelChecklist, type ChannelDay } from "@/lib/stats/channel-checklist";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

function count(messages: number, complete: boolean): string {
  return complete ? messages.toLocaleString() : messages ? `${messages.toLocaleString()}+` : "—";
}

function dayCount(day: ChannelDay): string {
  return day.coverage === "upcoming" ? "—" : count(day.messages, day.complete);
}

const coverageLabel: Record<ChannelDay["coverage"], string> = {
  imported: "Imported", tracked: "Tracked", importing: "Importing", unavailable: "Unavailable",
  partial: "Partial", upcoming: "Upcoming",
};

export default function ChannelChecklistDashboard() {
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState<ChannelChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const params = asOf ? `?date=${encodeURIComponent(asOf)}` : "";
        const response = await fetch(`/api/channel-checklist${params}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load channel activity.");
        if (active) { setData(result as ChannelChecklist); setError(""); setLoading(false); }
      } catch (caught) {
        if (active) { setError(caught instanceof Error ? caught.message : "Could not load channel activity."); setLoading(false); }
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [asOf]);

  const selectedDate = asOf || data?.selectedDate || "";
  const changingDate = !!data && data.selectedDate !== selectedDate;
  const weekDays = data?.channels[0]?.days ?? [];

  return <section className="channel-checklist">
    <div className="section-head starplayer-heading"><div>
      <span className="eyebrow">DISCORD CHANNELS</span><h2>Channel Check-List</h2>
      <p>Daily message output for three channels, with the Monday–Sunday total for the selected date. Counts include bot and webhook messages.</p>
    </div></div>
    <div className="channel-checklist-controls starplayer-panel">
      <div>
        <span className="eyebrow">CHOOSE A DATE</span>
        <div className="channel-date-actions">
          <button type="button" aria-label="Previous day" disabled={!selectedDate || (!!data?.earliestDate && selectedDate <= data.earliestDate)} onClick={() => setAsOf(shiftDate(selectedDate, -1))}>←</button>
          <label className="field-label">Selected day
            <input type="date" value={selectedDate} min={data?.earliestDate || undefined} max={data?.today} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <button type="button" aria-label="Next day" disabled={!selectedDate || !data || selectedDate >= data.today} onClick={() => setAsOf(shiftDate(selectedDate, 1))}>→</button>
          <button type="button" className="channel-today-button" disabled={!data || selectedDate === data.today} onClick={() => setAsOf(data?.today ?? "")}>Today</button>
        </div>
      </div>
      {data && <div className="channel-period"><span className="eyebrow">SELECTED WEEK</span><strong>{data.weekStart} → {data.weekEnd}</strong><small>{data.weekEnd === data.today ? "Week to date" : "Full week"} · {data.timeZone}</small></div>}
    </div>
    {error && <div className="error banner" role="alert">{error}</div>}
    {loading && !data && <div className="loading">Loading channel activity…</div>}
    {changingDate && !error && <div className="loading" role="status">Loading selected date…</div>}
    {data && !changingDate && <>
      <div className="channel-checklist-grid">
        {data.channels.map((channel) => <article className="stat channel-checklist-card" key={channel.id}>
          <span className="eyebrow">#{channel.name}</span><small className="channel-id">{channel.id}</small>
          <div className="channel-card-counts"><div><span>SELECTED DAY</span><b>{dayCount(channel.selectedDay)}</b><small>{coverageLabel[channel.selectedDay.coverage]}</small></div>
            <div><span>{data.weekEnd === data.today ? "WEEK TO DATE" : "WEEK TOTAL"}</span><b>{count(channel.week.messages, channel.week.complete)}</b><small>{channel.week.complete ? "Complete history" : "Partial history"}</small></div></div>
        </article>)}
      </div>
      <div className="starplayer-panel channel-week-panel">
        <div className="panel-head"><h3>Daily output</h3><span>Monday through Sunday · {data.timeZone}</span></div>
        <div className="table-scroll"><table><thead><tr><th>Date</th>{data.channels.map((channel) => <th key={channel.id}>#{channel.name}</th>)}</tr></thead>
          <tbody>{weekDays.map((day, index) => <tr key={day.date} className={day.date === data.selectedDate ? "channel-selected-day" : ""}>
            <td><strong>{weekday.format(new Date(`${day.date}T00:00:00Z`))} {day.date}</strong>{day.date === data.selectedDate && <small>Selected day</small>}</td>
            {data.channels.map((channel) => <td key={channel.id}><strong>{dayCount(channel.days[index])}</strong><small>{coverageLabel[channel.days[index].coverage]}</small></td>)}
          </tr>)}</tbody>
          <tfoot><tr><th>{data.weekEnd === data.today ? "Week to date" : "Week total"}</th>{data.channels.map((channel) => <th key={channel.id}>{count(channel.week.messages, channel.week.complete)}</th>)}</tr></tfoot>
        </table></div>
      </div>
      <p className="stats-note">A plus sign means the count can rise as older history imports. A dash means a reliable total is not available. Today updates when the bot syncs, usually within a minute; the import cutoff day may omit earlier bot messages.</p>
    </>}
  </section>;
}
