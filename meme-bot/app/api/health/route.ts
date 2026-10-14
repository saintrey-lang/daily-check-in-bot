import { authorized } from '../../../lib/auth.ts';
import { config, discordRequest, validateChannel, DiscordFailure } from '../../../lib/discord.ts';
import { isPaused, postingCounts } from '../../../lib/store.ts';
import { localDay } from '../../../lib/schedule.ts';
import { CAPTION_COUNT } from '../../../lib/catalog.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const user = await discordRequest('/users/@me');
    const channel = await validateChannel();
    const paused = await isPaused();
    const counts = await postingCounts(localDay());
    const { guildId, channelId } = config();
    return Response.json({ ready: true, botId: user.id, botName: user.username, guildId, channelId,
      channelName: channel.name, enabled: process.env.MEME_BOT_ENABLED === 'true', paused,
      target: 100, counts, captionCount: CAPTION_COUNT, topic: 'TFT and Golden Spatula' });
  } catch (error) {
    const status = error instanceof DiscordFailure ? error.status : null;
    return Response.json({ ready: false, discordStatus: status,
      error: status === 401 ? 'Bot token rejected' : status === 403 || status === 404 ? 'Bot cannot access the channel or its history; check installation and permissions' : 'Configuration check failed' }, { status: 503 });
  }
}
