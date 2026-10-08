import { ChannelType, PermissionFlagsBits, type Client, type Guild, type Message, type NewsChannel, type StageChannel, type TextChannel, type ThreadChannel, type VoiceChannel } from "discord.js";
import { localDateAt } from "../lib/checkin/core";
import { shiftDate, type HistoryPlan, type HistoryProgress, type StatDelta } from "../lib/stats/core";
import { StatsSheetsStore } from "../lib/stats/sheets";

type HistoryChannel = TextChannel | NewsChannel | ThreadChannel | VoiceChannel | StageChannel;
const DISCORD_EPOCH = 1_420_070_400_000;

// Convert the dashboard's local midnight to a Discord snowflake boundary.
export function dateBoundarySnowflake(date: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const target = Date.parse(`${date}T00:00:00Z`);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = (name: string) => Number(parts.find((part) => part.type === name)?.value);
    const local = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    guess += target - local;
  }
  return (BigInt(guess - DISCORD_EPOCH) << 22n).toString();
}

/** A completed channel has already imported from the previous cutoff onward. */
export function rewindCompletedHistory(states: HistoryProgress[], previousStart: string, timeZone: string): HistoryProgress[] {
  const before = dateBoundarySnowflake(previousStart, timeZone);
  return states.filter((state) => state.status === "complete").map((state) => ({
    ...state, before, coveredAfter: shiftDate(previousStart, -1), status: "pending", error: "",
  }));
}

type MemberSnapshot = { roleIds: string[]; name: string } | null;
type MemberCache = Map<string, Promise<MemberSnapshot>>;

function memberSnapshot(message: Message, guild: Guild, cache: MemberCache): Promise<MemberSnapshot> {
  if (message.member) return Promise.resolve({ roleIds: message.member.roles.cache.map((role) => role.id), name: message.member.displayName });
  if (message.webhookId) return Promise.resolve(null);
  let cached = cache.get(message.author.id);
  if (!cached) {
    cached = guild.members.fetch({ user: message.author.id, force: true })
      .then((member) => ({ roleIds: member.roles.cache.map((role) => role.id), name: member.displayName }))
      .catch(() => null);
    cache.set(message.author.id, cached);
  }
  return cached;
}

function recordMessage(message: Message, channel: HistoryChannel, date: string, rows: Map<string, StatDelta>, snapshot: MemberSnapshot): void {
  const key = message.author.id;
  const row = rows.get(key) ?? {
    id: `history:${channel.id}:${date}:${key}`, date, userId: message.author.id,
    displayName: snapshot?.name ?? message.author.globalName ?? message.author.username,
    channelId: channel.id, channelName: channel.name, messages: 0, voiceSeconds: 0,
    recordedAt: message.createdAt.toISOString(), roleIds: snapshot?.roleIds.sort() ?? [], isBot: message.author.bot || !!message.webhookId,
  };
  row.messages++;
  rows.set(key, row);
}

export async function importChannelHistory(
  channel: HistoryChannel, state: HistoryProgress, plan: HistoryPlan, store: StatsSheetsStore, timeZone: string,
  guild: Guild, memberCache: MemberCache = new Map(), paceMs = 4_000,
): Promise<void> {
  if (state.status === "complete") return;
  let before = state.before || dateBoundarySnowflake(plan.until, timeZone);
  let currentDay = "";
  let oldestInDay = "";
  const rows = new Map<string, StatDelta>();
  state.status = "running";
  state.error = "";
  await store.saveHistoryProgress(state);

  async function completeDay(): Promise<void> {
    if (!currentDay || currentDay < plan.from) return;
    await store.appendHistory([...rows.values()]);
    // Data is written before the coverage marker. Retried writes have the same row IDs.
    state.coveredAfter = shiftDate(currentDay, -1);
    state.before = oldestInDay;
    await store.saveHistoryProgress(state);
    rows.clear();
    // Leave Sheets write quota for live check-ins and minute-by-minute statistics.
    if (paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs));
  }

  try {
    while (true) {
      const batch = await channel.messages.fetch({ before, limit: 100 });
      if (!batch.size) break;
      const messages = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp || (a.id < b.id ? 1 : -1));
      // Message history does not carry historical role assignments. Resolve today's member roles once per user.
      const snapshots = new Map<string, MemberSnapshot>();
      const authors = [...new Set(messages.filter((message) => !message.member && !message.webhookId &&
        localDateAt(message.createdAt, timeZone) >= plan.from).map((message) => message.author.id))];
      for (let offset = 0; offset < authors.length; offset += 10) {
        await Promise.all(authors.slice(offset, offset + 10).map(async (id) => {
          const message = messages.find((entry) => entry.author.id === id)!;
          snapshots.set(id, await memberSnapshot(message, guild, memberCache));
        }));
      }
      for (const message of messages) {
        const date = localDateAt(message.createdAt, timeZone);
        if (date >= plan.until) { before = message.id; continue; }
        if (currentDay && date !== currentDay) {
          await completeDay();
          currentDay = "";
        }
        if (date < plan.from) {
          state.coveredAfter = shiftDate(plan.from, -1);
          state.status = "complete";
          state.error = "";
          await store.saveHistoryProgress(state);
          return;
        }
        currentDay = date;
        oldestInDay = message.id;
        const snapshot = message.member ? await memberSnapshot(message, guild, memberCache) : snapshots.get(message.author.id) ?? null;
        recordMessage(message, channel, date, rows, snapshot);
        before = message.id;
      }
      if (batch.size < 100) break;
    }
    await completeDay();
    state.coveredAfter = shiftDate(plan.from, -1);
    state.status = "complete";
    state.error = "";
    await store.saveHistoryProgress(state);
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.message.slice(0, 300) : "Could not read this channel's history.";
    await store.saveHistoryProgress(state).catch((saveError) => console.error("Could not save history error state.", saveError));
    throw error;
  }
}

export function attachHistory(client: Client, guildId: string, store: StatsSheetsStore, timeZone: string): void {
  let busy = false;
  async function run(): Promise<void> {
    if (busy || !client.isReady()) return;
    busy = true;
    try {
      const guild = await client.guilds.fetch(guildId);
      await store.saveRoles(guild.roles.cache.filter((role) => role.id !== guildId)
        .map((role) => ({ id: role.id, name: role.name })).sort((a, b) => a.name.localeCompare(b.name)));
      let plan = await store.readHistoryPlan();
      const existing = await store.readHistoryProgress();
      const serverStart = localDateAt(guild.createdAt, timeZone);
      if (!plan) {
        plan = { from: serverStart, until: localDateAt(new Date(), timeZone) };
        await store.saveHistoryPlan(plan);
      } else if (serverStart < plan.from) {
        // Keep the existing import and its coverage. Reopen only completed channels,
        // starting directly before the old cutoff instead of scanning those dates again.
        const byId = new Map(existing.map((state) => [state.channelId, state]));
        for (const rewound of rewindCompletedHistory(existing, plan.from, timeZone)) {
          await store.saveHistoryProgress(rewound);
          Object.assign(byId.get(rewound.channelId)!, rewound);
        }
        plan = { ...plan, from: serverStart };
        await store.saveHistoryPlan(plan);
      } else if (serverStart > plan.from) {
        plan = { ...plan, from: serverStart };
        await store.saveHistoryPlan(plan);
      }
      const accessible = new Map<string, HistoryChannel>();
      const add = (channel: HistoryChannel) => {
        const permissions = channel.permissionsFor(client.user!);
        if (permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) accessible.set(channel.id, channel);
      };
      const all = await guild.channels.fetch();
      for (const channel of all.values()) {
        if (!channel) continue;
        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement ||
            channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) add(channel);
      }
      const active = await guild.channels.fetchActiveThreads();
      for (const thread of active.threads.values()) add(thread);
      for (const channel of all.values()) {
        if (!channel || !(channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement ||
            channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia)) continue;
        const variants = channel.type === ChannelType.GuildText ? ["public", "private"] as const : ["public"] as const;
        for (const type of variants) {
          const fetchAll = type === "private" && !!channel.permissionsFor(client.user!)?.has(PermissionFlagsBits.ManageThreads);
          const joined = type === "private" && !fetchAll;
          let before: Date | ThreadChannel | undefined;
          let previousCursor = "";
          try {
            do {
              const page = await channel.threads.fetchArchived({ type, fetchAll, limit: 100, ...(before ? { before } : {}) });
              for (const thread of page.threads.values()) add(thread);
              const oldest = [...page.threads.values()].at(-1);
              const cursor = joined ? oldest?.id : oldest?.archiveTimestamp;
              if (!page.hasMore || !cursor || String(cursor) === previousCursor) break;
              if (!joined && Number(cursor) < Date.parse(`${plan.from}T00:00:00Z`) - 86_400_000) break;
              before = joined ? oldest : new Date(Number(cursor));
              previousCursor = String(cursor);
            } while (true);
          } catch (error) {
            console.warn(`Could not list ${type} archived threads in channel ${channel.id}; importing other channels.`, error);
          }
        }
      }
      const registered = new Set(existing.map((state) => state.channelId));
      const missing = [...accessible.values()].filter((channel) => !registered.has(channel.id)).map((channel) => ({
        channelId: channel.id, channelName: channel.name, before: dateBoundarySnowflake(plan.until, timeZone),
        coveredAfter: plan.until, status: "pending" as const, error: "",
      }));
      await store.addHistoryChannels(missing);
      const memberCache: MemberCache = new Map();
      for (const state of [...existing, ...missing]) {
        if (state.status === "complete") continue;
        const channel = accessible.get(state.channelId);
        if (!channel) {
          state.status = "error";
          state.error = "Channel or Read Message History permission unavailable.";
          await store.saveHistoryProgress(state);
          continue;
        }
        try {
          await importChannelHistory(channel, state, plan, store, timeZone, guild, memberCache);
        } catch (error) {
          console.error(`Could not backfill channel ${state.channelId}; remaining channels will continue.`, error);
        }
      }
    } catch (error) {
      console.error("Could not complete server message history import; will retry.", error);
    } finally { busy = false; }
  }
  if (client.isReady()) void run();
  else client.once("clientReady", () => void run());
  setInterval(() => void run(), 60 * 60_000);
}
