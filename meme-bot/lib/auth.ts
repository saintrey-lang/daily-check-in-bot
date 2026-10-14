import { timingSafeEqual } from 'node:crypto';

export function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
