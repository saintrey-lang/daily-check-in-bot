import { setTimeout as wait } from 'node:timers/promises';

export class DiscordFailure extends Error {
  status: number;
  retryAfter: number;
  constructor(status: number, retryAfter = 0) { super(`Discord API failed (HTTP ${status})`); this.status = status; this.retryAfter = retryAfter; }
}

export function config() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const channelId = process.env.MEME_CHANNEL_ID;
  if (!token || !guildId || !channelId || !/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(channelId)) {
    throw new Error('Discord configuration is incomplete');
  }
  return { token, guildId, channelId };
}

export async function discordRequest(path: string, init: RequestInit = {}) {
  const { token } = config();
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    headers: { ...init.headers, Authorization: `Bot ${token}` },
  });
  if (!response.ok) {
    const body = response.status === 429 ? await response.json().catch(() => ({})) : {};
    throw new DiscordFailure(response.status, Number(body.retry_after) || 0);
  }
  return response.json();
}

export async function validateChannel() {
  const { guildId, channelId } = config();
  const channel = await discordRequest(`/channels/${channelId}`);
  if (channel.guild_id !== guildId || channel.type !== 0) throw new Error('The configured channel must be a text channel in the configured server');
  return channel;
}

export async function sendMeme(image: Buffer, day: string, slot: number) {
  const { channelId } = config();
  const form = new FormData();
  const filename = `tft-golden-spatula-${day}-${String(slot + 1).padStart(3, '0')}.png`;
  form.append('payload_json', JSON.stringify({
    nonce: `meme-${day}-${slot}`, enforce_nonce: true,
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename, description: 'Original TFT and Golden Spatula gameplay meme' }],
  }));
  form.append('files[0]', new Blob([new Uint8Array(image)], { type: 'image/png' }), filename);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await discordRequest(`/channels/${channelId}/messages`, { method: 'POST', body: form });
    } catch (error) {
      if (error instanceof DiscordFailure && error.status === 429 && attempt < 2 && error.retryAfter <= 8) {
        await wait(Math.max(0.5, error.retryAfter) * 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Discord send did not complete');
}
