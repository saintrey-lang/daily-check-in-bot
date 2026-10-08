import { localDateAt } from "../checkin/core";

export type StatDelta = {
  id: string; date: string; userId: string; displayName: string;
  channelId: string; channelName: string; messages: number; voiceSeconds: number;
  recordedAt: string;
};
export type StatsConfig = { channelId: string; frequency: "daily" | "weekly"; time: string; timeZone: string; enabledAt?: string };
export type StatsSummary = {
  start: string; end: string; messages: number; voiceSeconds: number; activeMembers: number;
  daily: Array<{ date: string; messages: number; voiceSeconds: number }>;
  members: Array<{ id: string; name: string; messages: number; voiceSeconds: number }>;
  channels: Array<{ id: string; name: string; messages: number; voiceSeconds: number }>;
};

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function statsSummary(rows: StatDelta[], end: string, days: number): StatsSummary {
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error("Choose 1–31 days.");
  const start = shiftDate(end, 1 - days);
  const members = new Map<string, StatsSummary["members"][number]>();
  const channels = new Map<string, StatsSummary["channels"][number]>();
  const daily = new Map<string, StatsSummary["daily"][number]>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.date < start || row.date > end || seen.has(row.id)) continue;
    seen.add(row.id); // Retries of a timed-out Sheet append retain the same row ID.
    const member = members.get(row.userId) ?? { id: row.userId, name: row.displayName, messages: 0, voiceSeconds: 0 };
    const channel = channels.get(row.channelId) ?? { id: row.channelId, name: row.channelName, messages: 0, voiceSeconds: 0 };
    const day = daily.get(row.date) ?? { date: row.date, messages: 0, voiceSeconds: 0 };
    member.name = row.displayName || member.name;
    channel.name = row.channelName || channel.name;
    for (const item of [member, channel, day]) {
      item.messages += row.messages;
      item.voiceSeconds += row.voiceSeconds;
    }
    members.set(row.userId, member);
    channels.set(row.channelId, channel);
    daily.set(row.date, day);
  }
  const active = [...members.values()].filter((member) => member.messages || member.voiceSeconds);
  return {
    start, end,
    messages: active.reduce((count, member) => count + member.messages, 0),
    voiceSeconds: active.reduce((count, member) => count + member.voiceSeconds, 0),
    activeMembers: active.length,
    daily: Array.from({ length: days }, (_, index) => daily.get(shiftDate(start, index)) ?? { date: shiftDate(start, index), messages: 0, voiceSeconds: 0 }),
    members: active.sort((a, b) => b.messages + b.voiceSeconds / 60 - a.messages - a.voiceSeconds / 60),
    channels: [...channels.values()].sort((a, b) => b.messages + b.voiceSeconds / 60 - a.messages - a.voiceSeconds / 60),
  };
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
