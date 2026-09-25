import "dotenv/config";
import { AttachmentBuilder, Client, Events, GatewayIntentBits, type TextChannel } from "discord.js";
import { defaultConfig, promptEmbed, windowAt, type CheckinAsset, type CheckinConfig, type CheckinEmbed } from "../lib/checkin/core";
import { processCheckin, ensureDailyPrompt } from "../lib/checkin/service";
import { CheckinSheetsStore } from "../lib/checkin/sheets";
import { attachStarplayer } from "./starplayer";

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) throw new Error("Set DISCORD_BOT_TOKEN before starting the worker.");
const initialConfig = defaultConfig(process.env);
const store = new CheckinSheetsStore(initialConfig.sheetId);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const assetCache = new Map<string, CheckinAsset>();
let handledPrompt = "";
let archivedPrompt = "";
let promptBusy = false;
let queue = Promise.resolve();

function sheetsRateLimited(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as { code?: number | string; response?: { status?: number } };
  return failure.response?.status === 429 || String(failure.code) === "429";
}

async function retrySheetRead<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [2_000, 4_000, 8_000, 16_000];
  for (const delay of delays) {
    try { return await operation(); }
    catch (error) {
      if (!sheetsRateLimited(error)) throw error;
      console.warn(`Google Sheets is rate limited; retrying check-in in ${delay / 1_000}s.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return operation();
}

async function assetFor(id: string | null): Promise<CheckinAsset | null> {
  if (!id) return null;
  const cached = assetCache.get(id);
  if (cached) return cached;
  const asset = await store.readAsset(id);
  if (asset) assetCache.set(id, asset);
  return asset;
}

async function getChannel(config: CheckinConfig): Promise<TextChannel> {
  const channel = await client.channels.fetch(config.channelId);
  if (!channel?.isTextBased() || !("guildId" in channel) || channel.guildId !== config.guildId || !("send" in channel)) {
    throw new Error("The configured channel must be a text channel in the configured Discord server.");
  }
  return channel as TextChannel;
}

function payload(embed: CheckinEmbed, asset: CheckinAsset | null) {
  return {
    embeds: [asset?.mime.startsWith("image/") ? { ...embed, image: { url: `attachment://${asset.name}` } } : embed],
    files: asset ? [new AttachmentBuilder(asset.bytes, { name: asset.name })] : [],
    allowedMentions: { parse: [] as [] },
  };
}

async function tick(): Promise<void> {
  if (!client.isReady() || promptBusy) return;
  promptBusy = true;
  try {
    const config = await retrySheetRead(() => store.readConfig());
    if (config.supersededPromptId && archivedPrompt !== config.supersededPromptId) {
      const channel = await getChannel(config);
      try {
        const previous = await channel.messages.fetch(config.supersededPromptId);
        await previous.edit({ embeds: [{
          color: 0x64748b, title: "Previous check-in closed",
          description: "The check-in schedule was reset. Use the newest Day 1 announcement to check in when it appears.",
        }], attachments: [], files: [] });
      } catch (error) {
        // A removed announcement needs no further action.
        if (!(error instanceof Error && "code" in error && error.code === 10008)) throw error;
      }
      archivedPrompt = config.supersededPromptId;
    }
    const window = windowAt(new Date(), config);
    if (!window || !config.eventId) return;
    const key = `${config.eventId}:${window.day}:${config.revision}`;
    if (key === handledPrompt) return;
    const asset = await assetFor(config.prompt.assetId);
    const channel = await getChannel(config);
    await ensureDailyPrompt(
      new Date(), config, store,
      async () => {
        const embed = promptEmbed(window, config, asset);
        // Recover if Discord accepted the post just before a Sheet write or restart failed.
        const recent = await channel.messages.fetch({ limit: 100 });
        const previous = recent.find((message) =>
          message.author.id === client.user?.id && message.embeds[0]?.footer?.text === embed.footer?.text,
        );
        if (previous) return previous.id;
        return (await channel.send(payload(embed, asset))).id;
      },
      async (messageId) => {
        const message = await channel.messages.fetch(messageId);
        await message.edit({ ...payload(promptEmbed(window, config, asset), asset), attachments: [] });
      },
    );
    handledPrompt = key;
    console.info(`Daily check-in prompt ready: Day ${window.day}`);
  } catch (error) {
    console.error("Could not post or update the daily check-in prompt; will retry.", error);
  } finally {
    promptBusy = false;
  }
}

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  // One worker and one queue prevent two rapid messages from recording two check-ins.
  queue = queue.then(async () => {
    try {
      const config = await retrySheetRead(() => store.readConfig());
      if (message.guildId !== config.guildId || message.channelId !== config.channelId) return;
      const result = await retrySheetRead(() => processCheckin({
        id: message.id, guildId: message.guildId, channelId: message.channelId,
        userId: message.author.id, username: message.author.username,
        displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
        content: message.content, createdAt: message.createdAt, isBot: false,
      }, config, store));
      if (result.embed) {
        const asset = result.status === "checked-in" ? await retrySheetRead(() => assetFor(config.success.assetId)) : null;
        await message.reply({ ...payload(result.embed, asset), allowedMentions: { parse: [], repliedUser: false } });
      }
    } catch (error) {
      console.error("Could not process check-in message.", error);
      try {
        await message.reply({
          embeds: [{ color: 0xE35050, title: "Check-in could not be confirmed", description: "Please try again shortly. If you already checked in, the bot will tell you." }],
          allowedMentions: { parse: [], repliedUser: false },
        });
      } catch (replyError) {
        console.error("Could not deliver check-in error reply.", replyError);
      }
    }
  });
});

client.once(Events.ClientReady, () => {
  console.info(`Check-in bot connected as ${client.user?.tag}`);
  void tick();
  setInterval(() => void tick(), 10_000);
});
client.on(Events.Error, (error) => console.error("Discord connection error.", error));
attachStarplayer(client, initialConfig.guildId);

await store.setup();
await client.login(token);
