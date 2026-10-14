export const DAILY_LIMIT = 100;
export const TIMEZONE = 'Asia/Manila';
export const OFFSET_MS = 8 * 60 * 60 * 1000;
export const SLOT_MINUTES = Array.from({ length: DAILY_LIMIT }, (_, slot) => Math.floor(slot * 1440 / DAILY_LIMIT));

export function validSlot(value: string): number | null {
  if (!/^(0|[1-9][0-9]?)$/.test(value)) return null;
  const slot = Number(value);
  return slot < DAILY_LIMIT ? slot : null;
}

export function localDay(now = new Date()): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function scheduledInstance(slot: number, now = new Date()) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= DAILY_LIMIT) throw new Error('Invalid slot');
  let midnight = Date.parse(localDay(now) + 'T00:00:00+08:00');
  let dueAt = midnight + SLOT_MINUTES[slot] * 60_000;
  // A late 23:xx cron invocation may arrive just after local midnight.
  if (dueAt > now.getTime()) { midnight -= 86_400_000; dueAt -= 86_400_000; }
  return {
    day: localDay(new Date(midnight)), slot, dueAt,
    stale: now.getTime() - dueAt > 65 * 60_000,
  };
}

export function currentSlot(now = new Date()): number {
  const local = new Date(now.getTime() + OFFSET_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  for (let slot = DAILY_LIMIT - 1; slot >= 0; slot--) if (SLOT_MINUTES[slot] <= minutes) return slot;
  return 0;
}

export function cronDefinitions() {
  return SLOT_MINUTES.map((localMinute, slot) => {
    const utcMinute = (localMinute - 480 + 1440) % 1440;
    return { path: `/api/cron/${slot}`, schedule: `${utcMinute % 60} ${Math.floor(utcMinute / 60)} * * *` };
  });
}
