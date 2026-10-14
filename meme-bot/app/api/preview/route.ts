import { authorized } from '../../../lib/auth.ts';
import { pickMeme } from '../../../lib/catalog.ts';
import { renderMeme } from '../../../lib/render.ts';
import { currentSlot, localDay } from '../../../lib/schedule.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const image = await renderMeme(pickMeme(localDay(), currentSlot()));
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}
