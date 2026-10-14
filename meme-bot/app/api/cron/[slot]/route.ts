import { authorized } from '../../../../lib/auth.ts';
import { postSlot } from '../../../../lib/post.ts';
import { validSlot } from '../../../../lib/schedule.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ slot: string }> }) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const slot = validSlot((await context.params).slot);
  if (slot === null) return Response.json({ error: 'Invalid slot' }, { status: 400 });
  try {
    return Response.json(await postSlot(slot));
  } catch (error) {
    console.error('Meme invocation failed', { type: error instanceof Error ? error.name : 'Unknown' });
    return Response.json({ error: 'Posting configuration or service is unavailable' }, { status: 503 });
  }
}
