import { config, discordRequest } from './discord.ts';

export type PostedMeme = { day: string; slot: number; id: string; timestamp: string };
const MARKER = /^TFT & Golden Spatula \| (\d{4}-\d{2}-\d{2}) \| (\d{1,3})\/100$/;

export function messageMeme(message: Record<string, any>, botId: string): PostedMeme | null {
  if (message.author?.id !== botId) return null;
  for (const embed of message.embeds ?? []) {
    const match = MARKER.exec(embed.footer?.text ?? '');
    if (match && Number(match[2]) >= 1 && Number(match[2]) <= 100) {
      return { day: match[1], slot: Number(match[2]) - 1, id: message.id, timestamp: message.timestamp };
    }
  }
  return null;
}

export async function postingHistory(day: string): Promise<PostedMeme[]> {
  const { channelId, botId } = config();
  const oldest = Date.parse(day + 'T00:00:00+08:00');
  let before: string | undefined;
  const found: PostedMeme[] = [];
  for (let page = 0; page < 20; page++) {
    const path = `/channels/${channelId}/messages?limit=100${before ? '&before=' + before : ''}`;
    const messages = await discordRequest(path);
    if (!Array.isArray(messages)) throw new Error('Discord history response is invalid');
    for (const message of messages) {
      const record = messageMeme(message, botId);
      if (record && record.day === day) found.push(record);
    }
    if (messages.length < 100 || Date.parse(messages[messages.length - 1].timestamp) < oldest) return found;
    before = messages[messages.length - 1].id;
  }
  throw new Error('Channel history is too busy to verify this day safely');
}

export async function isPaused() {
  const id = process.env.MEME_CONTROL_MESSAGE_ID;
  if (!id) return false;
  const { channelId, botId } = config();
  const message = await discordRequest(`/channels/${channelId}/messages/${id}`);
  if (message.author?.id !== botId) throw new Error('The control message is not owned by this bot');
  const field = message.embeds?.[0]?.fields?.find((field: Record<string, string>) => field.name === 'Posting');
  if (!field || !['Active', 'Paused'].includes(field.value)) throw new Error('The control message is invalid');
  return field.value === 'Paused';
}

export async function setPaused(paused: boolean) {
  const { channelId } = config();
  const id = process.env.MEME_CONTROL_MESSAGE_ID;
  const body = JSON.stringify({
    embeds: [{ title: 'TFT & Golden Spatula Daily Memes', color: 0xf4b942,
      description: '100 gameplay image memes scheduled per day.',
      fields: [{ name: 'Posting', value: paused ? 'Paused' : 'Active', inline: true }],
    }], allowed_mentions: { parse: [] },
  });
  const message = await discordRequest(`/channels/${channelId}/messages${id ? '/' + id : ''}`, {
    method: id ? 'PATCH' : 'POST', body, headers: { 'Content-Type': 'application/json' },
  });
  return message.id as string;
}

export async function postingCounts(day: string) {
  const history = await postingHistory(day);
  return { sent: new Set(history.map(record => record.slot)).size };
}
