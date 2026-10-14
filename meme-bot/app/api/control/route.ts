import { authorized } from '../../../lib/auth.ts';
import { setPaused } from '../../../lib/store.ts';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.paused !== 'boolean') return Response.json({ error: 'paused must be a boolean' }, { status: 400 });
  const messageId = await setPaused(body.paused);
  return Response.json({ paused: body.paused, messageId, needsConfiguration: !process.env.MEME_CONTROL_MESSAGE_ID });
}
