import sharp from 'sharp';
import { SOURCE_SEED } from './source-seed.ts';
import { GOLDEN_SPATULA_SEED } from './golden-spatula-seed.ts';

export type MemeSource = { title: string; sourceUrl: string; imageUrl: string; creator: string; game?: 'golden-spatula' | 'tft' };
export type SourcedMeme = { image: Buffer; contentType: string; extension: string; source: MemeSource };
export const SOURCE_MODE = 'sourced-first';
export const SOURCE_PRIORITY = ['Golden Spatula sources', 'TFT sources', 'Generated Golden Spatula memes'] as const;
export const TENOR_FEED = 'https://tenor.com/official/teamfighttactics';
export const GOLDEN_SPATULA_FEED = 'https://tenor.com/search/golden-spatula-gifs';
const MAX_IMAGE_BYTES = 4_000_000;
const AGENT = 'TFTMemeBot/1.1 (+https://github.com/saintrey-lang/daily-check-in-bot)';
const CURATED: MemeSource[] = [
  { title: 'Pengu sees action', sourceUrl: 'https://x.com/TFT/status/1520403799776665601', imageUrl: 'https://pbs.twimg.com/media/FRmPJ0ZX0AAfG4E.png', creator: '@TFT on X' },
  { title: 'Pengu on playing TFT', sourceUrl: 'https://twitter.com/TFT/status/1662799892618649600', imageUrl: 'https://pbs.twimg.com/media/FxNznDcXsAEqtLQ.jpg', creator: '@TFT on X' },
  { title: 'Your team gone', sourceUrl: 'https://twitter.com/TFT/status/1662076330664402946', imageUrl: 'https://pbs.twimg.com/media/FxDheT4WwAAhn71.jpg', creator: '@TFT on X' },
];
const IMAGE_HOSTS = new Set(['pbs.twimg.com', 'media.tenor.com', 'media1.tenor.com']);
const GOLDEN_SPATULA_CREATORS = new Set(['theflamehd', 'err0rx_x', 'possumrug', 'mordekatser', 'fallcome', 'Milkdromeda_d']);

export function sourceKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (['x.com', 'twitter.com'].includes(url.hostname)) {
      const id = /^\/TFT\/status\/(\d+)\/?$/i.exec(url.pathname)?.[1];
      return id ? `x:${id}` : null;
    }
    if (url.hostname === 'tenor.com') {
      const id = /^\/view\/[a-z0-9-]+-gif-(\d+)\/?$/i.exec(url.pathname)?.[1];
      return id ? `tenor:${id}` : null;
    }
  } catch { /* An unrelated or malformed link is not a source record. */ }
  return null;
}

export function validImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && IMAGE_HOSTS.has(url.hostname);
  } catch { return false; }
}

export function parseOfficialTenor(html: string, game: 'tft' | 'golden-spatula' = 'tft'): MemeSource[] {
  const script = /<script\b[^>]*\bid=["']store-cache["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!script) return [];
  const found = new Map<string, MemeSource>();
  let visits = 0;
  const visit = (value: unknown, depth = 0) => {
    if (++visits > 30_000 || depth > 16 || !value || typeof value !== 'object') return;
    const row = value as Record<string, any>;
    const allowedCreator = game === 'golden-spatula'
      ? GOLDEN_SPATULA_CREATORS.has(row.user?.username)
      : row.user?.username === 'TeamfightTactics' && row.user?.usertype === 'partner';
    if (allowedCreator && typeof row.itemurl === 'string') {
      const blocked = /nsfw|adult|explicit|spoiler/i.test(JSON.stringify([row.flags, row.tags, row.h1_title]))
        || (row.policy_status && !['POLICY_STATUS_UNSPECIFIED', 'POLICY_STATUS_ALLOWED'].includes(row.policy_status));
      const tags = JSON.stringify(row.tags ?? []);
      const relevant = game === 'golden-spatula'
        ? /golden[\s_-]*spatula|金铲铲之战/i.test(tags) && !/spongebob|ultra rapid fire|\burf\b|cooking/i.test(tags)
        : /team\s*fight\s*tactics|\btft\b|pengu/i.test(tags);
      const full = row.media_formats?.gif;
      const formats = Number(full?.size) <= 1_000_000 ? [full, row.media_formats?.tinygif] : [row.media_formats?.tinygif, full];
      const format = formats
        .find(item => typeof item?.url === 'string' && validImageUrl(item.url) && Number(item.size) > 0 && Number(item.size) <= MAX_IMAGE_BYTES);
      const key = sourceKey(row.itemurl);
      if (!blocked && relevant && format && key) found.set(key, {
        title: String(row.h1_title || 'TFT reaction').slice(0, 160), sourceUrl: row.itemurl,
        imageUrl: format.url, creator: `${row.user.username} on Tenor`, game,
      });
      return;
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  try { visit(JSON.parse(script)); } catch { return []; }
  return [...found.values()];
}

export function parseGoldenSpatulaTenor(html: string): MemeSource[] {
  return parseOfficialTenor(html, 'golden-spatula');
}

export async function limitedBody(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit || !response.body) throw new Error('Source response exceeds the size limit');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('Source response exceeds the size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

export async function sourcePool(): Promise<MemeSource[]> {
  const loadFeed = async (url: string, parser: (html: string) => MemeSource[]) => {
    const response = await fetch(url, {
      headers: { 'User-Agent': AGENT }, redirect: 'error', signal: AbortSignal.timeout(8_000),
      next: { revalidate: 3600 },
    } as RequestInit);
    if (!response.ok) throw new Error('Source feed unavailable');
    return parser((await limitedBody(response, 2_000_000)).toString('utf8'));
  };
  const feeds = await Promise.allSettled([
    loadFeed(GOLDEN_SPATULA_FEED, parseGoldenSpatulaTenor), loadFeed(TENOR_FEED, parseOfficialTenor),
  ]);
  const liveGolden = feeds[0].status === 'fulfilled' ? feeds[0].value : [];
  const liveTft = feeds[1].status === 'fulfilled' ? feeds[1].value : [];
  if (feeds.some(feed => feed.status === 'rejected')) console.warn('A live source feed is unavailable; using reviewed source lists');
  // A curated fallback keeps sources available during discovery outages.
  const unique = new Map<string, MemeSource>();
  for (const source of [...liveGolden, ...GOLDEN_SPATULA_SEED, ...CURATED, ...liveTft, ...SOURCE_SEED]) {
    const key = sourceKey(source.sourceUrl);
    if (key && validImageUrl(source.imageUrl) && !unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()];
}

export async function downloadSource(source: MemeSource): Promise<SourcedMeme> {
  if (!sourceKey(source.sourceUrl) || !validImageUrl(source.imageUrl)) throw new Error('Unapproved meme source');
  const response = await fetch(source.imageUrl, {
    headers: { 'User-Agent': AGENT }, redirect: 'error', signal: AbortSignal.timeout(10_000),
    next: { revalidate: 86400 },
  } as RequestInit);
  if (!response.ok || !/^image\/(png|jpeg|gif|webp)(;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Source image unavailable');
  const image = await limitedBody(response, MAX_IMAGE_BYTES);
  const metadata = await sharp(image, { limitInputPixels: 20_000_000 }).metadata();
  const formats: Record<string, [string, string]> = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg'], gif: ['image/gif', 'gif'], webp: ['image/webp', 'webp'] };
  const format = formats[metadata.format ?? ''];
  if (!format || !metadata.width || !metadata.height) throw new Error('Source image is invalid');
  return { image, contentType: format[0], extension: format[1], source };
}

export function prioritizedSources(pool: MemeSource[], excluded: Set<string>, slot = 0): MemeSource[] {
  const available = pool.filter(source => !excluded.has(sourceKey(source.sourceUrl)!));
  const golden = available.filter(source => source.game === 'golden-spatula');
  const backup = available.filter(source => source.game !== 'golden-spatula');
  const curated = backup.filter(source => sourceKey(source.sourceUrl)!.startsWith('x:'));
  const reactions = backup.filter(source => !sourceKey(source.sourceUrl)!.startsWith('x:'));
  // Spreading slots across the pool reduces overlap if delayed cron jobs run together.
  if (golden.length) golden.push(...golden.splice(0, slot % golden.length));
  if (reactions.length) reactions.push(...reactions.splice(0, slot % reactions.length));
  return [...golden, ...curated, ...reactions];
}

export async function pickSourcedMeme(excluded: Set<string>, slot = 0): Promise<SourcedMeme | null> {
  const pool = prioritizedSources(await sourcePool(), excluded, slot);
  const golden = pool.filter(source => source.game === 'golden-spatula');
  const backup = pool.filter(source => source.game !== 'golden-spatula');
  // Try Golden Spatula first, reserving a final attempt for a sourced TFT backup.
  const attempts = golden.length ? [...golden.slice(0, 2), ...backup.slice(0, 1)] : backup.slice(0, 2);
  for (const source of attempts) {
    try { return await downloadSource(source); }
    catch { console.warn('A sourced meme was unavailable; trying another'); }
  }
  return null;
}
