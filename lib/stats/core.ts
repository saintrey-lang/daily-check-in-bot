import { localDateAt } from "../checkin/core";

export type StatDelta = {
  id: string; date: string; userId: string; displayName: string;
  channelId: string; channelName: string; messages: number; voiceSeconds: number;
  recordedAt: string; roleIds?: string[]; isBot?: boolean;
};
export type StatsConfig = { channelId: string; frequency: "daily" | "weekly"; time: string; timeZone: string; enabledAt?: string };
export type StatsRole = { id: string; name: string };
export type HistoryPlan = { from: string; until: string };
export type HistoryProgress = {
  channelId: string; channelName: string; before: string; coveredAfter: string;
  status: "pending" | "running" | "complete" | "error"; error: string;
};
export type StatsSummary = {
  start: string; end: string; messages: number; botMessages: number; voiceSeconds: number; activeMembers: number;
  daily: Array<{ date: string; messages: number; voiceSeconds: number }>;
  members: Array<{ id: string; name: string; messages: number; voiceSeconds: number; isBot: boolean }>;
  channels: Array<{ id: string; name: string; messages: number; voiceSeconds: number }>;
};
export type ChannelDrilldownRow = StatsSummary["channels"][number] & {
  historyStatus: HistoryProgress["status"] | "live-only";
};

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function statsSummary(rows: StatDelta[], end: string, days: number): StatsSummary {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("Choose 1–366 days.");
  const start = shiftDate(end, 1 - days);
  return statsSummaryRange(rows, start, end);
}

export function validStatsDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Imported channel-days replace live message counts, while preserving recorded voice time. */
export function statsSummaryRange(
  rows: StatDelta[], start: string, end: string,
  options: { roleId?: string; history?: StatDelta[]; progress?: HistoryProgress[]; plan?: HistoryPlan | null } = {},
): StatsSummary {
  if (!validStatsDate(start) || !validStatsDate(end) || start > end ||
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 >= 5_000) {
    throw new Error("Choose a valid date range of up to 5,000 days.");
  }
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const covered = new Map((options.progress ?? []).map((item) => [item.channelId, item.coveredAfter]));
  const imported = (channelId: string, date: string) => !!options.plan && date >= options.plan.from &&
    date < options.plan.until && !!covered.get(channelId) && date > covered.get(channelId)!;
  const members = new Map<string, StatsSummary["members"][number]>();
  const channels = new Map<string, StatsSummary["channels"][number]>();
  const daily = new Map<string, StatsSummary["daily"][number]>();
  const seen = new Set<string>(); let botMessages = 0;
  for (const [source, sourceRows] of [["live", rows], ["history", options.history ?? []]] as const) {
    for (const row of sourceRows) {
    if (row.date < start || row.date > end || seen.has(`${source}:${row.id}`) ||
        (source === "history" && !imported(row.channelId, row.date))) continue;
    if (options.roleId && !(row.roleIds ?? []).includes(options.roleId)) continue;
    seen.add(`${source}:${row.id}`); // A retried append keeps the same row ID.
    const member = members.get(row.userId) ?? { id: row.userId, name: row.displayName, messages: 0, voiceSeconds: 0, isBot: false };
    const channel = channels.get(row.channelId) ?? { id: row.channelId, name: row.channelName, messages: 0, voiceSeconds: 0 };
    const day = daily.get(row.date) ?? { date: row.date, messages: 0, voiceSeconds: 0 };
    member.name = row.displayName || member.name;
    member.isBot ||= !!row.isBot;
    channel.name = row.channelName || channel.name;
    const messages = source === "live" && imported(row.channelId, row.date) ? 0 : row.messages;
    if (row.isBot) botMessages += messages;
    for (const item of [member, channel, day]) {
      item.messages += messages;
      item.voiceSeconds += row.voiceSeconds;
    }
    members.set(row.userId, member);
    channels.set(row.channelId, channel);
    daily.set(row.date, day);
    }
  }
  const active = [...members.values()].filter((member) => member.messages || member.voiceSeconds);
  return {
    start, end,
    messages: active.reduce((count, member) => count + member.messages, 0),
    botMessages,
    voiceSeconds: active.reduce((count, member) => count + member.voiceSeconds, 0),
    activeMembers: active.length,
    daily: Array.from({ length: days }, (_, index) => daily.get(shiftDate(start, index)) ?? { date: shiftDate(start, index), messages: 0, voiceSeconds: 0 }),
    members: active.sort((a, b) => b.messages + b.voiceSeconds / 60 - a.messages - a.voiceSeconds / 60),
    channels: [...channels.values()].sort((a, b) => b.messages + b.voiceSeconds / 60 - a.messages - a.voiceSeconds / 60),
  };
}

/** Keep the channel inventory visible even when a channel is idle in the selected range. */
export function channelDrilldownRows(summary: StatsSummary, progress: HistoryProgress[]): ChannelDrilldownRow[] {
  const activity = new Map(summary.channels.map((channel) => [channel.id, channel]));
  const listed = new Set<string>();
  const channels: ChannelDrilldownRow[] = progress.map((state) => {
    listed.add(state.channelId);
    const current = activity.get(state.channelId);
    return { id: state.channelId, name: current?.name || state.channelName || state.channelId,
      messages: current?.messages ?? 0, voiceSeconds: current?.voiceSeconds ?? 0, historyStatus: state.status };
  });
  for (const channel of summary.channels) {
    if (!listed.has(channel.id)) channels.push({ ...channel, historyStatus: "live-only" });
  }
  return channels.sort((a, b) => b.messages - a.messages || b.voiceSeconds - a.voiceSeconds || a.name.localeCompare(b.name));
}

/** Players whose selected role was observed in tracked activity, with zeros for an idle period. */
export function roleMemberPerformance(
  rows: StatDelta[], history: StatDelta[], progress: HistoryProgress[], plan: HistoryPlan | null,
  roleId: string, periodMembers: StatsSummary["members"],
): StatsSummary["members"] {
  const covered = new Map(progress.map((item) => [item.channelId, item.coveredAfter]));
  const observed = new Map<string, { id: string; name: string; recordedAt: string }>();
  for (const [source, entries] of [["live", rows], ["history", history]] as const) {
    for (const row of entries) {
      if (row.isBot || !row.userId || !(row.roleIds ?? []).includes(roleId)) continue;
      if (source === "history" && (!plan || row.date < plan.from || row.date >= plan.until ||
        !covered.get(row.channelId) || row.date <= covered.get(row.channelId)!)) continue;
      const previous = observed.get(row.userId);
      if (!previous || row.recordedAt > previous.recordedAt) {
        observed.set(row.userId, { id: row.userId, name: row.displayName, recordedAt: row.recordedAt });
      }
    }
  }
  const performance = new Map(periodMembers.map((member) => [member.id, member]));
  return [...observed.values()].map((member) => {
    const current = performance.get(member.id);
    return { id: member.id, name: current?.name || member.name, messages: current?.messages ?? 0,
      voiceSeconds: current?.voiceSeconds ?? 0, isBot: false };
  }).sort((a, b) => b.messages - a.messages || b.voiceSeconds - a.voiceSeconds || a.name.localeCompare(b.name));
}

export function validateStatsConfig(input: StatsConfig): StatsConfig {
  if (input.channelId && !/^\d{17,20}$/.test(input.channelId)) throw new Error("Enter a valid Discord report channel ID.");
  if (input.frequency !== "daily" && input.frequency !== "weekly") throw new Error("Choose daily or weekly reports.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Enter a report time in HH:MM format.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone }); }
  catch { throw new Error("Enter a valid report timezone."); }
  if (input.enabledAt && !Number.isFinite(Date.parse(input.enabledAt))) throw new Error("Invalid report start time.");
  return input;
}

export function reportDue(now: Date, config: StatsConfig): { key: string; end: string; days: number } | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (part: string) => parts.find((entry) => entry.type === part)?.value ?? "";
  const date = localDateAt(now, config.timeZone);
  const time = `${value("hour")}:${value("minute")}`;
  const eligible = (keyDate: string) => {
    if (!config.enabledAt) return true;
    const enabled = new Date(config.enabledAt);
    const enabledDate = localDateAt(enabled, config.timeZone);
    if (keyDate !== enabledDate) return keyDate > enabledDate;
    const enabledParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(enabled);
    const enabledTime = `${enabledParts.find((part) => part.type === "hour")?.value}:${enabledParts.find((part) => part.type === "minute")?.value}`;
    return enabledTime < config.time;
  };
  if (config.frequency === "daily") {
    const key = time >= config.time ? date : shiftDate(date, -1);
    if (!eligible(key)) return null;
    return { key: `daily:${key}`, end: shiftDate(key, -1), days: 1 };
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  let monday = shiftDate(date, -(weekday + 6) % 7);
  if (date === monday && time < config.time) monday = shiftDate(monday, -7);
  if (!eligible(monday)) return null;
  return { key: `weekly:${monday}`, end: shiftDate(monday, -1), days: 7 };
}
