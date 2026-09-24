import {
  formatResetTime, milestoneFor, nextCivilDate, nextStreak, promptEmbed, resetTimeForDate, successEmbed, windowAt,
  type CheckinConfig, type CheckinEmbed, type CheckinRecord, type CheckinWindow,
} from "./core";

export type PromptRecord = { messageId: string; revision: string };
export type CheckinStore = {
  readCheckins(eventId: string): Promise<CheckinRecord[]>;
  appendCheckin(record: CheckinRecord): Promise<void>;
  getPrompt(eventId: string, day: number): Promise<PromptRecord | null>;
  appendPrompt(eventId: string, window: CheckinWindow, messageId: string, revision: string): Promise<void>;
  setPromptRevision(eventId: string, day: number, revision: string): Promise<void>;
};

export type IncomingCheckin = {
  id: string; guildId: string | null; channelId: string; userId: string;
  username: string; displayName: string; content: string; createdAt: Date; isBot: boolean;
};

export async function processCheckin(
  message: IncomingCheckin,
  config: CheckinConfig,
  store: CheckinStore,
): Promise<{ status: "ignored" | "duplicate" | "checked-in"; embed?: CheckinEmbed }> {
  if (message.isBot || message.guildId !== config.guildId || message.channelId !== config.channelId) return { status: "ignored" };
  const window = windowAt(message.createdAt, config);
  if (!window || message.content.trim().toUpperCase() !== window.code || !config.eventId) return { status: "ignored" };
  // Never accept a code until the daily announcement has been delivered and recorded.
  const prompt = await store.getPrompt(config.eventId, window.day);
  if (!prompt || prompt.revision !== config.revision) return { status: "ignored" };
  const previous = await store.readCheckins(config.eventId);
  if (previous.some((row) => row.discordId === message.userId && row.day === window.day)) {
    return {
      status: "duplicate",
      embed: { color: 0x7759E8, title: "Already checked in today", description: `Your Day ${window.day} check-in is recorded. Come back after the next ${formatResetTime(resetTimeForDate(nextCivilDate(window.date), config))} reset!` },
    };
  }
  const streak = nextStreak(previous, message.userId, config.eventId, window.day);
  await store.appendCheckin({
    eventId: config.eventId, day: window.day, date: window.date,
    checkedInAt: message.createdAt.toISOString(), discordId: message.userId,
    username: message.username, displayName: message.displayName, code: window.code,
    streak, milestone: milestoneFor(streak), messageId: message.id, channelId: message.channelId,
  });
  return { status: "checked-in", embed: successEmbed(window, streak, config) };
}

export async function ensureDailyPrompt(
  now: Date,
  config: CheckinConfig,
  store: CheckinStore,
  post: (embed: CheckinEmbed) => Promise<string>,
  update?: (messageId: string, embed: CheckinEmbed) => Promise<void>,
): Promise<number | null> {
  const window = windowAt(now, config);
  if (!window || !config.eventId) return null;
  const previous = await store.getPrompt(config.eventId, window.day);
  if (!previous) {
    const messageId = await post(promptEmbed(window, config));
    await store.appendPrompt(config.eventId, window, messageId, config.revision);
  } else if (update && previous.revision !== config.revision) {
    await update(previous.messageId, promptEmbed(window, config));
    await store.setPromptRevision(config.eventId, window.day, config.revision);
  }
  return window.day;
}
