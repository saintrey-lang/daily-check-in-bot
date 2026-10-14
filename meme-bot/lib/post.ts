import { pickMeme } from './catalog.ts';
import { DiscordFailure, sendMeme, validateChannel } from './discord.ts';
import { renderMeme } from './render.ts';
import { scheduledInstance } from './schedule.ts';
import { claimSlot, isPaused, recordResult } from './store.ts';

export const dependencies = { pickMeme, validateChannel, renderMeme, sendMeme, claimSlot, isPaused, recordResult };

export async function postSlot(slot: number, now = new Date(), deps = dependencies) {
  if (process.env.MEME_BOT_ENABLED !== 'true') return { status: 'disabled' };
  const instance = scheduledInstance(slot, now);
  if (instance.stale) return { status: 'stale', day: instance.day, slot };
  if (await deps.isPaused()) return { status: 'paused' };
  await deps.validateChannel();
  const image = await deps.renderMeme(deps.pickMeme(instance.day, slot));
  if (!await deps.claimSlot(instance.day, slot)) return { status: 'already_claimed', day: instance.day, slot };
  let message;
  try {
    message = await deps.sendMeme(image, instance.day, slot);
  } catch (error) {
    const knownRejection = error instanceof DiscordFailure && error.status < 500;
    const state = knownRejection ? 'failed' : 'uncertain';
    // Keep the immutable claim when a send is rejected or delivery is ambiguous.
    // An interrupted invocation cannot repost this slot after a redeployment.
    await deps.recordResult(instance.day, slot, state).catch(() => {});
    console.warn('Meme delivery not confirmed', { day: instance.day, slot, state });
    return { status: state, day: instance.day, slot };
  }
  let recorded = true;
  await deps.recordResult(instance.day, slot, 'sent', message.id).catch(() => { recorded = false; });
  console.log('Meme confirmed', { day: instance.day, slot, messageId: message.id, recorded });
  return { status: 'sent', day: instance.day, slot, messageId: message.id, recorded };
}
