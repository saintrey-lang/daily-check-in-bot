import { get, list, put } from '@vercel/blob';

export async function claimSlot(day: string, slot: number, storage = { put, get }): Promise<boolean> {
  const path = `claims/${day}/${slot}.json`;
  try {
    await storage.put(path, JSON.stringify({ day, slot, claimedAt: new Date().toISOString() }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json',
    });
    return true;
  } catch (error) {
    // SDK versions use different errors for an existing pathname. Confirm the
    // immutable claim rather than treating every storage failure as a duplicate.
    const existing = await storage.get(path, { access: 'private', useCache: false }).catch(() => null);
    if (existing?.statusCode === 200) return false;
    throw error;
  }
}

export async function recordResult(day: string, slot: number, state: 'sent' | 'failed' | 'uncertain', messageId?: string) {
  await put(`results/${day}/${state}/${slot}.json`, JSON.stringify({ day, slot, state, messageId, recordedAt: new Date().toISOString() }), {
    access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json',
  });
}

export async function isPaused() {
  const result = await get('settings/paused.json', { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return false;
  const value = await new Response(result.stream).json();
  return value.paused === true;
}

export async function setPaused(paused: boolean) {
  await put('settings/paused.json', JSON.stringify({ paused }), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}

export async function postingCounts(day: string) {
  let cursor: string | undefined;
  const names: string[] = [];
  do {
    const result = await list({ prefix: `results/${day}/`, limit: 1000, cursor });
    names.push(...result.blobs.map(blob => blob.pathname));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return {
    sent: names.filter(name => name.includes('/sent/')).length,
    failed: names.filter(name => name.includes('/failed/')).length,
    uncertain: names.filter(name => name.includes('/uncertain/')).length,
  };
}
