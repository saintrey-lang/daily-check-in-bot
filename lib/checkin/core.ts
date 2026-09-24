export const EVENT_DAYS = 15;
export const MILESTONES = [4, 7, 15] as const;
export const WEEKDAY_CODES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export type EmbedTemplate = { title: string; description: string; color: string; assetId: string | null };
export type CheckinConfig = {
  eventId: string | null;
  startedAt: string | null;
  startDate: string | null;
  channelId: string;
  guildId: string;
  sheetId: string;
  timeZone: string;
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
  const sheetInput = env.CHECKIN_GOOGLE_SHEET_ID?.trim() || "13OEb5uguT-KPDvTwrnsRcv_WEhWf1ZeAsaF3-uDmYnA";
  const sheetId = sheetInput.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || sheetInput;
  const config: CheckinConfig = {
    eventId: null, startedAt: null, startDate: null,
    channelId: env.CHECKIN_CHANNEL_ID?.trim() || "1503972816079425706",
    guildId: env.CHECKIN_GUILD_ID?.trim() || "1293668498450419712",
    sheetId, timeZone: env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila",
    codes: Array.from({ length: EVENT_DAYS }, (_, i) => WEEKDAY_CODES[i % 7]),
    prompt: { title: "DAY {day} CHECK-IN", description: "Type today's code in this channel to check in. Your next day begins at 8:00 AM ({timezone}).", color: "#7759E8", assetId: null },
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
  if (config.codes.length !== EVENT_DAYS || config.codes.some((code) => !/^[A-Z0-9_-]{2,32}$/.test(code))) throw new Error("Enter exactly 15 codes, with 2–32 letters, digits, _ or - in each.");
  if (config.codes[0] !== "MONDAY") throw new Error("Day 1 code must be MONDAY.");
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

/** The event day resets at 08:00 in the chosen timezone, including DST transitions. */
export function windowDateAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const value = (part: string) => parts.find((item) => item.type === part)?.value ?? "";
  let dayNumber = civilDay(`${value("year")}-${value("month")}-${value("day")}`);
  if (Number(value("hour")) < 8) dayNumber -= 1;
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

export function windowAt(instant: Date, config: CheckinConfig): CheckinWindow | null {
  if (!config.startedAt || !config.startDate || !config.eventId || instant.getTime() < Date.parse(config.startedAt)) return null;
  const date = windowDateAt(instant, config.timeZone);
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
  return {
    ...config,
    eventId: `checkin-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    startedAt: now.toISOString(),
    startDate: windowDateAt(now, config.timeZone),
    revision: now.toISOString(),
  };
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{(day|code|daysLeft|streak|milestone|timezone)\}/g, (_, key: string) => values[key] ?? "");
}

function assetImage(asset?: CheckinAsset | null): { image?: { url: string } } {
  return asset?.mime.startsWith("image/") ? { image: { url: `attachment://${asset.name}` } } : {};
}

export function promptEmbed(window: CheckinWindow, config: CheckinConfig, asset?: CheckinAsset | null): CheckinEmbed {
  const values = { day: String(window.day), code: window.code, daysLeft: String(EVENT_DAYS - window.day), streak: "", milestone: "", timezone: config.timeZone };
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
  const values = { day: String(window.day), code: window.code, daysLeft: String(EVENT_DAYS - window.day), streak: String(streak), milestone: milestone ? String(milestone) : "", timezone: config.timeZone };
  return {
    color: milestone ? 0xF5B942 : Number.parseInt(config.success.color.slice(1), 16),
    title: render(config.success.title, values),
    description: render(config.success.description, values),
    ...(milestone ? { fields: [{ name: "🎉 MILESTONE REACHED", value: `${milestone} consecutive daily check-ins!` }] } : {}),
    footer: { text: `Day ${window.day}/${EVENT_DAYS}` },
    ...assetImage(asset),
  };
}
