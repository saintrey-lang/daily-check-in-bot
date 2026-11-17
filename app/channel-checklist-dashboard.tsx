"use client";

import { useEffect, useState, type FormEvent } from "react";
import { shiftDate } from "@/lib/stats/core";
import { type ChannelChecklist, type ChannelDay } from "@/lib/stats/channel-checklist";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

function count(messages: number, complete: boolean): string {
  return complete ? messages.toLocaleString() : messages ? `${messages.toLocaleString()}+` : "—";
}

const coverageLabel: Record<ChannelDay["coverage"], string> = {
  imported: "Imported", tracked: "Tracked", importing: "Importing", unavailable: "Unavailable", partial: "Partial",
};

function comparison(selected: ChannelDay, previous: ChannelDay): string {
  if (!selected.complete || !previous.complete) return "Comparison available when both days have complete history.";
  if (selected.messages > previous.messages) return `${(selected.messages - previous.messages).toLocaleString()} above the previous day`;
  return `${(previous.messages - selected.messages + 1).toLocaleString()} more to beat the previous day`;
}

export default function ChannelChecklistDashboard() {
  const [asOf, setAsOf] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeDraft, setRangeDraft] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<ChannelChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const params = new URLSearchParams();
        if (asOf) params.set("date", asOf);
        if (rangeStart) params.set("from", rangeStart);
        if (rangeEnd) params.set("to", rangeEnd);
        const response = await fetch(`/api/channel-checklist?${params}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load channel activity.");
        if (active) {
          const next = result as ChannelChecklist;
          setData(next);
          setRangeDraft((current) => current ?? { from: next.rangeStart, to: next.rangeEnd });
          setError(""); setLoading(false);
        }
      } catch (caught) {
        if (active) { setError(caught instanceof Error ? caught.message : "Could not load channel activity."); setLoading(false); }
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [asOf, rangeStart, rangeEnd]);

  const selectedDate = asOf || data?.selectedDate || "";
  const appliedStart = rangeStart || data?.rangeStart || "";
  const appliedEnd = rangeEnd || data?.rangeEnd || "";
  const changing = !!data && (data.selectedDate !== selectedDate || data.rangeStart !== appliedStart || data.rangeEnd !== appliedEnd);
  const rangeDays = rangeDraft && Number.isFinite(Date.parse(rangeDraft.from)) && Number.isFinite(Date.parse(rangeDraft.to))
    ? Math.round((Date.parse(`${rangeDraft.to}T00:00:00Z`) - Date.parse(`${rangeDraft.from}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  const validRange = !!data && !!rangeDraft?.from && !!rangeDraft.to && rangeDraft.from >= data.earliestDate &&
    rangeDraft.from <= rangeDraft.to && rangeDraft.to <= data.today && rangeDays >= 1 && rangeDays <= 31;
  const rangeChanged = !!rangeDraft && (rangeDraft.from !== appliedStart || rangeDraft.to !== appliedEnd);
  const rangeDaysShown = data?.channels[0]?.days ?? [];

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rangeDraft || !validRange) return;
    setRangeStart(rangeDraft.from); setRangeEnd(rangeDraft.to);
  }

  return <section className="channel-checklist">
    <div className="section-head starplayer-heading"><div>
      <span className="eyebrow">DISCORD CHANNELS</span><h2>Channel Check-List</h2>
      <p>Compare each channel with the previous day, then choose a separate date range for weekly output. Counts include bot and webhook messages.</p>
    </div></div>

    <div className="channel-section-title"><div><span className="eyebrow">DAILY ACTIVITY</span><h3>Daily comparison</h3></div><span>{data?.timeZone || "Asia/Manila"}</span></div>
    <div className="channel-checklist-controls starplayer-panel">
      <div><span className="eyebrow">CHOOSE A DATE</span>
        <div className="channel-date-actions">
          <button type="button" aria-label="Previous day" disabled={!selectedDate || (!!data?.earliestDate && selectedDate <= data.earliestDate)} onClick={() => setAsOf(shiftDate(selectedDate, -1))}>←</button>
          <label className="field-label">Selected day<input type="date" value={selectedDate} min={data?.earliestDate || undefined} max={data?.today} onChange={(event) => setAsOf(event.target.value)} /></label>
          <button type="button" aria-label="Next day" disabled={!selectedDate || !data || selectedDate >= data.today} onClick={() => setAsOf(shiftDate(selectedDate, 1))}>→</button>
          <button type="button" disabled={!data || selectedDate === data.today} onClick={() => setAsOf(data?.today ?? "")}>Today</button>
        </div>
      </div>
      {data && <div className="channel-period"><span className="eyebrow">COMPARE WITH</span><strong>{data.previousDate}</strong><small>Previous day · {data.timeZone}</small></div>}
    </div>
    {error && <div className="error banner" role="alert">{error}</div>}
    {loading && !data && <div className="loading">Loading channel activity…</div>}
    {changing && !error && <div className="loading" role="status">Loading selected dates…</div>}
    {data && !changing && <div className="channel-checklist-grid">
      {data.channels.map((channel) => <article className="stat channel-checklist-card" key={channel.id}>
        <span className="eyebrow">#{channel.name}</span><small className="channel-id">{channel.id}</small>
        <div className="channel-card-counts"><div><span>SELECTED DAY</span><b>{count(channel.selectedDay.messages, channel.selectedDay.complete)}</b><small>{coverageLabel[channel.selectedDay.coverage]}</small></div>
          <div><span>PREVIOUS DAY</span><b>{count(channel.previousDay.messages, channel.previousDay.complete)}</b><small>{coverageLabel[channel.previousDay.coverage]}</small></div></div>
        <p className="channel-comparison">{comparison(channel.selectedDay, channel.previousDay)}</p>
      </article>)}
    </div>}

    <div className="channel-section-title channel-week-title"><div><span className="eyebrow">WEEKLY ACTIVITY</span><h3>Weekly output</h3></div><span>Choose the exact dates to include</span></div>
    <form className="channel-range-controls starplayer-panel" onSubmit={applyRange}>
      <div><span className="eyebrow">DATE RANGE</span><p>From and To are inclusive. Choose up to 31 days, such as November 10–17.</p></div>
      <div className="channel-range-fields">
        <label className="field-label">From<input type="date" required value={rangeDraft?.from || ""} min={data?.earliestDate || undefined} max={data?.today} onChange={(event) => setRangeDraft((current) => ({ from: event.target.value, to: current?.to || "" }))} /></label>
        <label className="field-label">To<input type="date" required value={rangeDraft?.to || ""} min={data?.earliestDate || undefined} max={data?.today} onChange={(event) => setRangeDraft((current) => ({ from: current?.from || "", to: event.target.value }))} /></label>
        <button type="submit" className="primary" disabled={!validRange || !rangeChanged}>Apply range ↗</button>
      </div>
      {rangeDraft && !validRange && <small className="channel-range-error" role="status">Choose a valid start and end date of up to 31 days.</small>}
    </form>
    {data && !changing && <>
      <div className="channel-range-heading"><strong>{data.rangeStart} → {data.rangeEnd}</strong><span>{rangeDaysShown.length} days · {data.timeZone}</span></div>
      <div className="channel-checklist-grid channel-range-grid">
        {data.channels.map((channel) => <article className="stat channel-range-card" key={channel.id}>
          <span className="eyebrow">#{channel.name}</span><small className="channel-id">{channel.id}</small>
          <b>{count(channel.range.messages, channel.range.complete)}</b>
          <small>{channel.range.complete ? "Messages in selected range" : "Partial history in selected range"}</small>
        </article>)}
      </div>
      <div className="starplayer-panel channel-week-panel">
        <div className="panel-head"><h3>Daily output in this range</h3><span>{data.rangeStart} → {data.rangeEnd} · {data.timeZone}</span></div>
        <div className="table-scroll"><table><thead><tr><th>Date</th>{data.channels.map((channel) => <th key={channel.id}>#{channel.name}</th>)}</tr></thead>
          <tbody>{rangeDaysShown.map((day, index) => <tr key={day.date} className={day.date === data.selectedDate ? "channel-selected-day" : ""}>
            <td><strong>{weekday.format(new Date(`${day.date}T00:00:00Z`))} {day.date}</strong>{day.date === data.selectedDate && <small>Selected day</small>}</td>
            {data.channels.map((channel) => <td key={channel.id}><strong>{count(channel.days[index].messages, channel.days[index].complete)}</strong><small>{coverageLabel[channel.days[index].coverage]}</small></td>)}
          </tr>)}</tbody>
          <tfoot><tr><th>Range total</th>{data.channels.map((channel) => <th key={channel.id}>{count(channel.range.messages, channel.range.complete)}</th>)}</tr></tfoot>
        </table></div>
      </div>
      <p className="stats-note">A plus sign means older history is incomplete. A dash means a reliable count is unavailable. Today updates when the bot syncs, usually within a minute; the import cutoff day may omit earlier bot messages.</p>
    </>}
  </section>;
}
