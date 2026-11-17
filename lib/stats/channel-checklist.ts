import { shiftDate, statsSummaryRange, type HistoryPlan, type HistoryProgress, type StatDelta } from "./core";

export const CHECKLIST_CHANNELS = [
  { id: "1561661190789144587", name: "admin-tour" },
  { id: "1293667554866499676", name: "general-discussion" },
  { id: "1503972816079425706", name: "anniversary-checkin" },
] as const;

export type ChannelDay = {
  date: string; messages: number; complete: boolean;
  coverage: "imported" | "tracked" | "importing" | "unavailable" | "partial";
};
export type ChannelChecklist = {
  today: string; selectedDate: string; previousDate: string;
  rangeStart: string; rangeEnd: string; earliestDate: string; timeZone: string;
  channels: Array<{
    id: string; name: string; selectedDay: ChannelDay; previousDay: ChannelDay;
    range: { messages: number; complete: boolean }; days: ChannelDay[];
  }>;
};

export function buildChannelChecklist(
  rows: StatDelta[], history: StatDelta[], progress: HistoryProgress[], plan: HistoryPlan | null,
  selectedDate: string, rangeStart: string, rangeEnd: string, today: string, timeZone: string,
): ChannelChecklist {
  const previousDate = shiftDate(selectedDate, -1);
  const rangeLength = Math.round((Date.parse(`${rangeEnd}T00:00:00Z`) - Date.parse(`${rangeStart}T00:00:00Z`)) / 86_400_000) + 1;
  const progressById = new Map(progress.map((item) => [item.channelId, item]));

  const channels = CHECKLIST_CHANNELS.map((channel) => {
    const state = progressById.get(channel.id);
    const channelRows = rows.filter((row) => row.channelId === channel.id);
    const channelHistory = history.filter((row) => row.channelId === channel.id);
    const options = { history: channelHistory, progress, plan };
    const comparison = statsSummaryRange(channelRows, previousDate, selectedDate, options);
    const summary = statsSummaryRange(channelRows, rangeStart, rangeEnd, options);
    const day = (date: string, messages: number): ChannelDay => {
      if (!plan) return { date, messages, complete: false, coverage: "unavailable" };
      if (date < plan.from) return { date, messages, complete: false, coverage: "unavailable" };
      if (date === plan.until) return { date, messages, complete: false, coverage: "partial" };
      if (date > plan.until) return { date, messages, complete: true, coverage: "tracked" };
      if (state && date > state.coveredAfter) return { date, messages, complete: true, coverage: "imported" };
      return { date, messages, complete: false,
        coverage: state?.status === "error" ? "unavailable" : "importing" };
    };
    const selectedDay = day(selectedDate, comparison.daily[1].messages);
    const previousDay = day(previousDate, comparison.daily[0].messages);
    const days = Array.from({ length: rangeLength }, (_, index) => {
      const item = summary.daily[index];
      return day(item.date, item.messages);
    });
    return {
      id: channel.id,
      name: state?.channelName || summary.channels.find((item) => item.id === channel.id)?.name || channel.name,
      selectedDay, previousDay,
      range: { messages: days.reduce((total, item) => total + item.messages, 0),
        complete: days.every((item) => item.complete) },
      days,
    };
  });
  return { today, selectedDate, previousDate, rangeStart, rangeEnd, earliestDate: plan?.from ?? "", timeZone, channels };
}
