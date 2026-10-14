import { pickMeme } from './catalog.ts';
import { DiscordFailure, sendMeme, validateChannel } from './discord.ts';
import { renderMeme } from './render.ts';
import { scheduledInstance } from './schedule.ts';
import { pickSourcedMeme } from './sources.ts';
import { isPaused, postingHistory, recentSourceKeys } from './store.ts';

export const dependencies = { pickMeme, validateChannel, renderMeme, sendMeme, isPaused, postingHistory, pickSourcedMeme, recentSourceKeys };

export async function postSlot(slot: number, now = new Date(), deps = dependencies) {
  if (process.env.MEME_BOT_ENABLED !== 'true') return { status: 'disabled' };
  const instance = scheduledInstance(slot, now);
  if (instance.stale) return { status: 'stale', day: instance.day, slot };
  if (await deps.isPaused()) return { status: 'paused' };
  await deps.validateChannel();
  const history = await deps.postingHistory(instance.day);
  if (history.some(record => record.slot === slot)) return { status: 'already_posted', day: instance.day, slot };
  if (history.length >= 100) return { status: 'daily_target_reached', day: instance.day };
  const sourced = await deps.recentSourceKeys(now).then(keys => deps.pickSourcedMeme(keys, slot)).catch(() => null);
  const image = sourced?.image ?? await deps.renderMeme(deps.pickMeme(instance.day, slot));
  const content = sourced ? 'sourced' : 'generated';
  try {
    const message = await deps.sendMeme(image, instance.day, slot, sourced ?? undefined);
    console.log('Meme confirmed', { day: instance.day, slot, messageId: message.id, content, source: sourced?.source.sourceUrl });
    return { status: 'sent', day: instance.day, slot, messageId: message.id, content, ...(sourced ? { source: sourced.source.sourceUrl } : {}) };
  } catch (error) {
    const recovered = await deps.postingHistory(instance.day).catch(() => []);
    const existing = recovered.find(record => record.slot === slot);
    if (existing) return { status: 'sent', day: instance.day, slot, messageId: existing.id };
    const rejected = error instanceof DiscordFailure && error.status < 500;
    console.warn('Meme delivery not confirmed', { day: instance.day, slot, state: rejected ? 'failed' : 'uncertain' });
    return { status: rejected ? 'failed' : 'uncertain', day: instance.day, slot };
  }
}
