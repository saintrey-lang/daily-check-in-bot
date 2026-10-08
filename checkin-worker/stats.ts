import { randomUUID } from "node:crypto";
import { Client, Events, type Message, type VoiceState } from "discord.js";
import { localDateAt } from "../lib/checkin/core";
import { reportDue, shiftDate, statsSummaryRange, type StatDelta } from "../lib/stats/core";
import { StatsSheetsStore } from "../lib/stats/sheets";
import { attachHistory } from "./history";
import { attachStaffRoster } from "./staff";

type Bucket = Omit<StatDelta, "id" | "recordedAt">;
type VoiceSession = { userId: string; displayName: string; channelId: string; channelName: string; since: number; roleIds: string[]; isBot: boolean };

export function attachStats(client: Client, guildId: string, sheetId: string): void {
  const store = new StatsSheetsStore(sheetId);
  const buckets = new Map<string, Bucket>();
  const voice = new Map<string, VoiceSession>();
  const seenMessages = new Set<string>();
  let inFlight: StatDelta[] | null = null;
  let busy = false;
  let lastSent = "";
  let reporting = false;
  let statsReady = false;
  let settingUp = false;
  let historyStarted = false;
  let staffStarted = false;
  const timeZone = process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila";

  async function ensureSetup(): Promise<void> {
    if (statsReady || settingUp) return;
    settingUp = true;
    try {
      await store.setup(); statsReady = true;
      if (!historyStarted) { historyStarted = true; attachHistory(client, guildId, store, timeZone); }
      if (!staffStarted) { staffStarted = true; attachStaffRoster(client, guildId, store, timeZone); }
    }
    catch (error) { console.error("Could not set up server statistics; will retry without stopping check-ins.", error); }
    finally { settingUp = false; }
  }

  function add(date: string, userId: string, displayName: string, channelId: string, channelName: string,
    messages: number, voiceSeconds: number, roleIds: string[], isBot: boolean): void {
    const roles = [...roleIds].sort();
    const key = `${date}:${userId}:${channelId}:${roles.join(",")}:${isBot}`;
    const bucket = buckets.get(key) ?? { date, userId, displayName, channelId, channelName, messages: 0, voiceSeconds: 0, roleIds: roles, isBot };
    bucket.displayName = displayName;
    bucket.channelName = channelName;
    bucket.messages += messages;
    bucket.voiceSeconds += voiceSeconds;
    buckets.set(key, bucket);
  }

  function accrue(session: VoiceSession, until: number): void {
    let from = session.since;
    while (from < until) {
      const date = localDateAt(new Date(from), timeZone);
      let to = until;
      if (localDateAt(new Date(until - 1), timeZone) !== date) {
        // Find the local midnight even if the configured timezone changes offset.
        let low = from + 1;
        let high = until;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (localDateAt(new Date(mid), timeZone) === date) low = mid + 1;
          else high = mid;
        }
        to = low;
      }
      add(date, session.userId, session.displayName, session.channelId, session.channelName, 0, (to - from) / 1_000, session.roleIds, session.isBot);
      from = to;
    }
    session.since = until;
  }

  client.on(Events.MessageCreate, (message: Message) => {
    if (message.guildId !== guildId || seenMessages.has(message.id)) return;
    seenMessages.add(message.id);
    if (seenMessages.size > 10_000) seenMessages.clear();
    add(localDateAt(message.createdAt, timeZone), message.author.id,
      message.member?.displayName ?? message.author.globalName ?? message.author.username,
      message.channelId, "name" in message.channel ? String(message.channel.name) : message.channelId, 1, 0,
      message.member?.roles.cache.map((role) => role.id) ?? [], message.author.bot || !!message.webhookId);
  });

  client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
    if (newState.guild.id !== guildId || oldState.channelId === newState.channelId) return;
    const userId = newState.id;
    const current = voice.get(userId);
    if (current) { accrue(current, Date.now()); voice.delete(userId); }
    if (newState.channelId && !newState.member?.user.bot) voice.set(userId, {
      userId, displayName: newState.member?.displayName ?? userId,
      channelId: newState.channelId, channelName: newState.channel?.name ?? newState.channelId, since: Date.now(),
      roleIds: newState.member?.roles.cache.map((role) => role.id) ?? [], isBot: false,
    });
  });

  async function flush(): Promise<void> {
    if (busy || !statsReady) return;
    busy = true;
    try {
      const now = Date.now();
      for (const session of voice.values()) accrue(session, now);
      if (!inFlight && buckets.size) {
        const timestamp = new Date(now).toISOString();
        inFlight = [...buckets.values()].map((bucket) => ({ ...bucket, id: randomUUID(), voiceSeconds: Math.round(bucket.voiceSeconds * 1_000) / 1_000, recordedAt: timestamp }));
        buckets.clear();
      }
      if (inFlight) {
        await store.append(inFlight);
        inFlight = null;
      }
    } catch (error) {
      console.error("Could not save server statistics; retrying the same batch.", error);
    } finally { busy = false; }
  }

  async function report(): Promise<void> {
    if (reporting || !client.isReady() || !statsReady) return;
    reporting = true;
    try {
      const config = await store.readConfig();
      if (!config.channelId) return;
      const due = reportDue(new Date(), config);
      if (!due || lastSent === due.key) return;
      if (await store.readLastReport() === due.key) { lastSent = due.key; return; }
      await flush();
      if (inFlight) return; // Wait for a successful Sheet write before reporting.
      const channel = await client.channels.fetch(config.channelId);
      if (!channel?.isTextBased() || !("guildId" in channel) || channel.guildId !== guildId || !("send" in channel)) {
        throw new Error("The report channel must be a text channel in the configured server with Send Messages permission.");
      }
      const existing = await channel.messages.fetch({ limit: 30 });
      const footer = `SERVER_STATS:${due.key}`;
      const alreadyPosted = existing.some((message) => message.author.id === client.user?.id && message.embeds[0]?.footer?.text === footer);
      if (!alreadyPosted) {
        const [live, history, progress, plan] = await Promise.all([
          store.readRows(), store.readHistory(), store.readHistoryProgress(), store.readHistoryPlan(),
        ]);
        const summary = statsSummaryRange(live, shiftDate(due.end, 1 - due.days), due.end, { history, progress, plan });
        const top = (items: typeof summary.members | typeof summary.channels, unit: "messages" | "voiceSeconds") =>
          [...items].sort((a, b) => b[unit] - a[unit]).filter((item) => item[unit] > 0).slice(0, 5)
            .map((item, index) => `${index + 1}. ${item.name.replace(/[`*_~|<>@]/g, "").slice(0, 50)} · ${unit === "messages" ? item.messages.toLocaleString() : `${(item.voiceSeconds / 3_600).toFixed(1)}h`}`).join("\n") || "No activity recorded";
        await channel.send({ embeds: [{
          title: `Server activity · ${due.days === 7 ? "Weekly" : "Daily"} report`,
          description: `${summary.start} to ${summary.end} (${config.timeZone})\nTracking began when the statistics worker was enabled.`,
          color: 0xA6F1FF,
          fields: [
            { name: "Messages", value: summary.messages.toLocaleString(), inline: true },
            { name: "Voice time", value: `${(summary.voiceSeconds / 3_600).toFixed(1)} hours`, inline: true },
            { name: "Active members", value: String(summary.activeMembers), inline: true },
            { name: "Top message channels", value: top(summary.channels, "messages"), inline: true },
            { name: "Top members by messages", value: top(summary.members, "messages"), inline: true },
            { name: "Top voice channels", value: top(summary.channels, "voiceSeconds"), inline: false },
          ], footer: { text: footer },
        }], allowedMentions: { parse: [] } });
      }
      await store.saveLastReport(due.key);
      lastSent = due.key;
    } catch (error) {
      console.error("Could not post the scheduled server statistics report; retrying.", error);
    } finally { reporting = false; }
  }

  client.once(Events.ClientReady, () => {
    const guild = client.guilds.cache.get(guildId);
    for (const state of guild?.voiceStates.cache.values() ?? []) {
      if (!state.channelId || state.member?.user.bot) continue;
      voice.set(state.id, {
        userId: state.id, displayName: state.member?.displayName ?? state.id,
        channelId: state.channelId, channelName: state.channel?.name ?? state.channelId, since: Date.now(),
        roleIds: state.member?.roles.cache.map((role) => role.id) ?? [], isBot: false,
      });
    }
    console.info(`Server statistics tracking started for guild ${guildId}`);
    void ensureSetup();
    setInterval(() => { void ensureSetup().then(() => flush()).then(report); }, 60_000);
  });

}
