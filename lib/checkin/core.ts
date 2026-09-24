export const EVENT_DAYS = 15;
export const MILESTONES = [4, 7, 15] as const;
export const WEEKDAY_CODES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
export const DEFAULT_RESET_TIME = "08:00";
export const OLD_DEFAULT_PROMPT = "Type today's code in this channel to check in. Your next day begins at 8:00 AM ({timezone}).";
export const DEFAULT_PROMPT = "Type today's code in this channel to check in. Your next day begins at {resetTime} ({timezone}).";

export type EmbedTemplate = { title: string; description: string; color: string; assetId: string | null };
export type ResetChange = { date: string; time: string };
export type CheckinConfig = {
  eventId: string | null;
  startedAt: string | null;
  startDate: string | null;
  channelId: string;
  guildId: string;
  sheetId: string;
  timeZone: string;
  resetTime: string;
  resetSchedule: ResetChange[];
  codes: string[];
  prompt: EmbedTemplate;
  success: EmbedTemplate;
  revision: string;
};
export type CheckinWindow = { day: number; date: string; code: string };
export type CheckinEmbed = {
  color: number;
  title: string;
  description: string;
  fields?: Array<{ name: string; value: string }>;
  footer?: { text: string };
  image?: { url: string };
};
export type CheckinRecord = {
  eventId: string; day: number; date: string; checkedInAt: string;
  discordId: string; username: string; displayName: string; code: string;
  streak: number; milestone: number | null; messageId: string; channelId: string;
};
export type CheckinAsset = { id: string; name: string; mime: string; bytes: Buffer };

export function defaultConfig(env: Record<string, string | undefined>): CheckinConfig {
  const sheetInput = env.CHECKIN_GOOGLE_SHEET_ID?.trim();
  if (!sheetInput) throw new Error("Set CHECKIN_GOOGLE_SHEET_ID to the event's Google Sheet ID or URL.");
  const sheetId = sheetInput.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || sheetInput;
  const config: CheckinConfig = {
    eventId: null, startedAt: null, startDate: null,
    channelId: env.CHECKIN_CHANNEL_ID?.trim() || "1503972816079425706",
    guildId: env.CHECKIN_GUILD_ID?.trim() || "1293483684888055840",
    sheetId, timeZone: env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila",
    resetTime: DEFAULT_RESET_TIME, resetSchedule: [],
    codes: Array.from({ length: EVENT_DAYS }, (_, i) => WEEKDAY_CODES[i % 7]),
    prompt: { title: "DAY {day} CHECK-IN", description: DEFAULT_PROMPT, color: "#7759E8", assetId: null },
    success: { title: "DAY {day} - CHECK-IN VERIFIED", description: "Congratulations for checking in! **{daysLeft} DAYS TO GO!**\nCurrent streak: **{streak} day(s)**.", color: "#41C897", assetId: null },
    revision: new Date(0).toISOString(),
  };
  validateConfig(config);
  return config;
}

export function validateConfig(config: CheckinConfig): void {
  if (!/^\d{17,20}$/.test(config.channelId) || !/^\d{17,20}$/.test(config.guildId)) throw new Error("Discord channel and server IDs must contain 17–20 digits.");
  if (!/^[\w-]{20,}$/.test(config.sheetId)) throw new Error("Invalid Google Sheet ID.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone }); }
  catch { throw new Error("Invalid timezone. Use a name such as Asia/Manila."); }
  if (!validResetTime(config.resetTime)) throw new Error("Choose a daily reset time in HH:MM format.");
  if (!Array.isArray(config.resetSchedule) || config.resetSchedule.some((change, index) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(change.date) || !validResetTime(change.time) ||
    (index > 0 && change.date <= config.resetSchedule[index - 1].date),
  )) throw new Error("Invalid daily reset schedule.");
  if (config.codes.length !== EVENT_DAYS || config.codes.some((code) => !/^[A-Z0-9_-]{2,32}$/.test(code))) throw new Error("Enter exactly 15 codes, with 2–32 letters, digits, _ or - in each.");
  for (const template of [config.prompt, config.success]) {
    if (!template.title.trim() || template.title.length > 256 || !template.description.trim() || template.description.length > 3500 || !/^#[0-9a-fA-F]{6}$/.test(template.color)) {
      throw new Error("Each embed needs a title (up to 256 characters), message (up to 3,500), and hex color.");
    }
  }
}

function civilDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid start date.");
  const [year, month, day] = date.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  if (new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error("Invalid start date.");
  return timestamp / 86_400_000;
}

function validResetTime(value: string): boolean {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatResetTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function nextCivilDate(date: string): string {
  return new Date((civilDay(date) + 1) * 86_400_000).toISOString().slice(0, 10);
}

function localParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const value = (part: string) => parts.find((item) => item.type === part)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

export function localDateAt(instant: Date, timeZone: string): string {
  return localParts(instant, timeZone).date;
}

export function resetTimeForDate(date: string, config: Pick<CheckinConfig, "resetTime" | "resetSchedule">): string {
  let time = config.resetSchedule[0]?.time ?? config.resetTime;
  for (const change of config.resetSchedule) {
    if (change.date > date) break;
    time = change.time;
  }
  return time;
}

/** A reset-time edit during an event applies on the next local calendar date. */
export function withResetTime(config: CheckinConfig, resetTime: string, now: Date): CheckinConfig {
  if (config.resetTime === resetTime) return config;
  if (!windowAt(now, config) || !config.startDate) return { ...config, resetTime };
  const date = nextCivilDate(localDateAt(now, config.timeZone));
  const baseline = config.resetSchedule.length ? config.resetSchedule : [{ date: config.startDate, time: config.resetTime }];
  return { ...config, resetTime, resetSchedule: [...baseline.filter((change) => change.date < date), { date, time: resetTime }] };
}

/** The event day resets at the configured local time, including DST transitions. */
export function windowDateAt(instant: Date, config: Pick<CheckinConfig, "timeZone" | "resetTime" | "resetSchedule">): string {
  const { date, time } = localParts(instant, config.timeZone);
  let dayNumber = civilDay(date);
  if (time < resetTimeForDate(date, config)) dayNumber -= 1;
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

export function windowAt(instant: Date, config: CheckinConfig): CheckinWindow | null {
  if (!config.startedAt || !config.startDate || !config.eventId || instant.getTime() < Date.parse(config.startedAt)) return null;
  const date = windowDateAt(instant, config);
  const day = civilDay(date) - civilDay(config.startDate) + 1;
  if (day < 1 || day > EVENT_DAYS) return null;
  return { day, date, code: config.codes[day - 1] };
}

export function nextStreak(records: CheckinRecord[], userId: string, eventId: string, day: number): number {
  const days = new Set(records.filter((row) => row.discordId === userId && row.eventId === eventId).map((row) => row.day));
  let streak = 1;
  while (days.has(day - streak)) streak += 1;
  return streak;
}

export function milestoneFor(streak: number): number | null {
  return MILESTONES.find((number) => number === streak) ?? null;
}

export function startEvent(config: CheckinConfig, now: Date): CheckinConfig {
  if (windowAt(now, config)) throw new Error("A check-in event is already running.");
  if (config.startedAt && Date.parse(config.startedAt) > now.getTime()) throw new Error("An event is already scheduled.");
  validateConfig(config);
  const startDate = windowDateAt(now, { ...config, resetSchedule: [] });
  return {
    ...config,
    eventId: `checkin-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    startedAt: now.toISOString(),
    startDate,
    resetSchedule: [{ date: startDate, time: config.resetTime }],
    revision: now.toISOString(),
  };
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{(day|code|daysLeft|streak|milestone|timezone|resetTime)\}/g, (_, key: string) => values[key] ?? "");
}

function assetImage(asset?: CheckinAsset | null): { image?: { url: string } } {
  return asset?.mime.startsWith("image/") ? { image: { url: `attachment://${asset.name}` } } : {};
}

export function promptEmbed(window: CheckinWindow, config: CheckinConfig, asset?: CheckinAsset | null): CheckinEmbed {
  const values = { day: String(window.day), code: window.code, daysLeft: String(EVENT_DAYS - window.day), streak: "", milestone: "", timezone: config.timeZone, resetTime: formatResetTime(resetTimeForDate(nextCivilDate(window.date), config)) };
  return {
    color: Number.parseInt(config.prompt.color.slice(1), 16),
    title: render(config.prompt.title, values),
    description: render(config.prompt.description, values),
    fields: [{ name: "DAILY CODE", value: `**${window.code}**` }, { name: "Streak milestones", value: "4 days · 7 days · 15 days" }],
    footer: { text: `${config.eventId} · ${window.date} · Day ${window.day}/${EVENT_DAYS}` },
    ...assetImage(asset),
  };
}

export function successEmbed(window: CheckinWindow, streak: number, config: CheckinConfig, asset?: CheckinAsset | null): CheckinEmbed {
  const milestone = milestoneFor(streak);
  const values = { day: String(window.day), code: window.code, daysLeft: String(EVENT_DAYS - window.day), streak: String(streak), milestone: milestone ? String(milestone) : "", timezone: config.timeZone, resetTime: formatResetTime(resetTimeForDate(nextCivilDate(window.date), config)) };
  return {
    color: milestone ? 0xF5B942 : Number.parseInt(config.success.color.slice(1), 16),
    title: render(config.success.title, values),
    description: render(config.success.description, values),
    ...(milestone ? { fields: [{ name: "🎉 MILESTONE REACHED", value: `${milestone} consecutive daily check-ins!` }] } : {}),
    footer: { text: `Day ${window.day}/${EVENT_DAYS}` },
    ...assetImage(asset),
  };
}
