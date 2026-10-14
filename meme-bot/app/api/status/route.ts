import { authorized } from '../../../lib/auth.ts';
import { localDay, TIMEZONE } from '../../../lib/schedule.ts';
import { isPaused, postingCounts } from '../../../lib/store.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const day = localDay();
  const [counts, paused] = await Promise.all([postingCounts(day), isPaused()]);
  return Response.json({ day, timezone: TIMEZONE, target: 100, counts, paused, enabled: process.env.MEME_BOT_ENABLED === 'true' });
}
