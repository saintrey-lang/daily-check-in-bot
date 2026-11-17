import { shiftDate, statsSummaryRange, type HistoryPlan, type HistoryProgress, type StatDelta } from "./core";

export const CHECKLIST_CHANNELS = [
  { id: "1561661190789144587", name: "admin-tour" },
  { id: "1293667554866499676", name: "general-discussion" },
  { id: "1503972816079425706", name: "anniversary-checkin" },
] as const;

export type ChannelDay = {
  date: string; messages: number; complete: boolean;
  coverage: "imported" | "tracked" | "importing" | "unavailable" | "partial" | "upcoming";
};
export type ChannelChecklist = {
  today: string; selectedDate: string; weekStart: string; weekEnd: string; earliestDate: string; timeZone: string;
  channels: Array<{
    id: string; name: string; selectedDay: ChannelDay;
    week: { messages: number; complete: boolean }; days: ChannelDay[];
  }>;
};

export function buildChannelChecklist(
  rows: StatDelta[], history: StatDelta[], progress: HistoryProgress[], plan: HistoryPlan | null,
  selectedDate: string, today: string, timeZone: string,
): ChannelChecklist {
  const weekday = new Date(`${selectedDate}T00:00:00Z`).getUTCDay();
  const weekStart = shiftDate(selectedDate, -((weekday + 6) % 7));
  const sunday = shiftDate(weekStart, 6);
  const weekEnd = sunday < today ? sunday : today;
  const progressById = new Map(progress.map((item) => [item.channelId, item]));

  const channels = CHECKLIST_CHANNELS.map((channel) => {
    const state = progressById.get(channel.id);
    const channelRows = rows.filter((row) => row.channelId === channel.id);
    const channelHistory = history.filter((row) => row.channelId === channel.id);
    const summary = statsSummaryRange(channelRows, weekStart, weekEnd, { history: channelHistory, progress, plan });
    const dailyMessages = new Map(summary.daily.map((day) => [day.date, day.messages]));
    const days: ChannelDay[] = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(weekStart, index);
      const messages = dailyMessages.get(date) ?? 0;
      if (date > today) return { date, messages: 0, complete: false, coverage: "upcoming" };
      if (!plan) return { date, messages, complete: false, coverage: "unavailable" };
      if (date < plan.from) return { date, messages, complete: false, coverage: "unavailable" };
      if (date === plan.until) return { date, messages, complete: false, coverage: "partial" };
      if (date > plan.until) return { date, messages, complete: true, coverage: "tracked" };
      if (state && date > state.coveredAfter) return { date, messages, complete: true, coverage: "imported" };
      return { date, messages, complete: false,
        coverage: state?.status === "error" ? "unavailable" : "importing" };
    });
    return {
      id: channel.id,
      name: state?.channelName || summary.channels.find((item) => item.id === channel.id)?.name || channel.name,
      selectedDay: days.find((day) => day.date === selectedDate)!,
      week: { messages: days.reduce((total, day) => total + day.messages, 0),
        complete: days.filter((day) => day.date <= today).every((day) => day.complete) },
      days,
    };
  });
  return { today, selectedDate, weekStart, weekEnd, earliestDate: plan?.from ?? "", timeZone, channels };
}
