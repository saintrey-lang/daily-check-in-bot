import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { authorized } from '../lib/auth.ts';
import { CAPTION_COUNT, pickMeme } from '../lib/catalog.ts';
import { config, DiscordFailure, sendMeme } from '../lib/discord.ts';
import { postSlot, dependencies } from '../lib/post.ts';
import { renderMeme } from '../lib/render.ts';
import { messageMeme, postingHistory, recentSourceKeys, type PostedMeme } from '../lib/store.ts';
import { limitedBody, parseOfficialTenor, sourceKey, validImageUrl, type SourcedMeme } from '../lib/sources.ts';
import { cronDefinitions, currentSlot, DAILY_LIMIT, localDay, scheduledInstance, SLOT_MINUTES, validSlot } from '../lib/schedule.ts';

const now = new Date('2026-10-14T04:00:00Z');
const mockBotId = '1559764725632475206';
function discordEnv() {
  process.env.DISCORD_BOT_TOKEN = Buffer.from(mockBotId).toString('base64url') + '.mock.signature';
  process.env.DISCORD_GUILD_ID = '1293483684888055840';
  process.env.MEME_CHANNEL_ID = '1373136118270394459';
}

test('100 unique daily cron jobs use 14/15 minute spacing', () => {
  const jobs = cronDefinitions();
  assert.equal(jobs.length, 100);
  assert.equal(new Set(jobs.map(j => j.path)).size, 100);
  assert.equal(new Set(jobs.map(j => j.schedule)).size, 100);
  assert.equal(jobs[0].schedule, '0 16 * * *');
  for (let i = 1; i < SLOT_MINUTES.length; i++) assert.ok([14, 15].includes(SLOT_MINUTES[i] - SLOT_MINUTES[i - 1]));
  assert.ok(jobs.every(j => j.schedule.endsWith(' * * *')));
  assert.deepEqual(JSON.parse(readFileSync('vercel.json', 'utf8')).crons, jobs);
});

test('local midnight and late final slots use the correct day', () => {
  assert.equal(localDay(new Date('2026-10-13T16:00:00Z')), '2026-10-14');
  const late = scheduledInstance(99, new Date('2026-10-14T16:12:00Z'));
  assert.equal(late.day, '2026-10-14');
  assert.equal(late.stale, false);
  assert.equal(currentSlot(now), 50);
});

test('stale and invalid slots are rejected', () => {
  assert.equal(scheduledInstance(0, now).stale, true);
  for (const input of ['100', '-1', '1.5', '00', '2foo', '']) assert.equal(validSlot(input), null);
  assert.equal(validSlot('99'), 99);
  assert.throws(() => scheduledInstance(100, now));
});

test('daily batches have 100 distinct game-specific captions', () => {
  assert.equal(CAPTION_COUNT, 240);
  const memes = Array.from({ length: DAILY_LIMIT }, (_, i) => pickMeme('2026-10-14', i));
  assert.equal(new Set(memes.map(m => m.id)).size, 100);
  assert.ok(memes.every(m => /TFT|Golden Spatula/.test(m.top)));
});

test('image generation includes bundled fonts and stays within upload size', async () => {
  const image = await renderMeme(pickMeme('2026-10-14', 0));
  const info = await sharp(image).metadata();
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1080);
  assert.equal(info.format, 'png');
  assert.ok(image.length > 20_000 && image.length < 4_000_000);
});

test('authorization fails closed on missing or incorrect credentials', () => {
  process.env.CRON_SECRET = 'x'.repeat(48);
  assert.equal(authorized(new Request('https://example.test')), false);
  assert.equal(authorized(new Request('https://example.test', { headers: { authorization: 'Bearer incorrect' } })), false);
  assert.equal(authorized(new Request('https://example.test', { headers: { authorization: 'Bearer ' + 'x'.repeat(48) } })), true);
});

function fakeDeps() {
  const state = { history: [] as PostedMeme[], sends: 0 };
  const deps: typeof dependencies = {
    pickMeme, validateChannel: async () => ({}), renderMeme: async () => Buffer.from('png'),
    isPaused: async () => false, postingHistory: async () => [...state.history],
    recentSourceKeys: async () => new Set<string>(), pickSourcedMeme: async () => null,
    sendMeme: async (_image, day, slot) => {
      // Model Discord's enforce_nonce behavior for concurrent submissions.
      const existing = state.history.find(record => record.day === day && record.slot === slot);
      if (existing) return { id: existing.id };
      state.sends++;
      const message = { day, slot, id: '123456789', timestamp: now.toISOString() };
      state.history.push(message);
      return message;
    },
  };
  return { state, deps };
}

test('history plus enforced nonces collapse repeated and concurrent calls', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  await Promise.all([postSlot(50, now, deps), postSlot(50, now, deps), postSlot(50, now, deps)]);
  assert.equal(state.sends, 1);
  assert.equal((await postSlot(50, now, deps)).status, 'already_posted');
});

test('disabled, paused, and stale calls do not send', async () => {
  const { state, deps } = fakeDeps();
  process.env.MEME_BOT_ENABLED = 'false';
  assert.equal((await postSlot(50, now, deps)).status, 'disabled');
  process.env.MEME_BOT_ENABLED = 'true';
  assert.equal((await postSlot(0, now, deps)).status, 'stale');
  deps.isPaused = async () => true;
  assert.equal((await postSlot(50, now, deps)).status, 'paused');
  assert.equal(state.sends, 0);
});

test('a known rejection is reported without claiming successful delivery', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.sendMeme = async () => { throw new DiscordFailure(403); };
  assert.equal((await postSlot(50, now, deps)).status, 'failed');
  assert.equal(state.history.length, 0);
});

test('an interrupted send can be recovered from durable Discord history', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.sendMeme = async () => {
    state.history.push({ day: '2026-10-14', slot: 50, id: '321', timestamp: now.toISOString() });
    throw new Error('timeout after acceptance');
  };
  const result = await postSlot(50, now, deps);
  assert.equal(result.status, 'sent');
  assert.equal('messageId' in result && result.messageId, '321');
  assert.equal((await postSlot(50, now, deps)).status, 'already_posted');
});

test('unavailable channel history fails closed before sending', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.postingHistory = async () => { throw new DiscordFailure(403); };
  await assert.rejects(postSlot(50, now, deps));
  assert.equal(state.sends, 0);
});

test('only the configured bot and valid daily markers count as memes', () => {
  const message = { id: '1', author: { id: mockBotId }, timestamp: now.toISOString(),
    embeds: [{ footer: { text: 'TFT & Golden Spatula | 2026-10-14 | 51/100' } }] };
  assert.equal(messageMeme(message, mockBotId)?.slot, 50);
  assert.equal(messageMeme(message, 'another-bot'), null);
  assert.equal(messageMeme({ ...message, embeds: [{ footer: { text: 'invalid' } }] }, mockBotId), null);
});

test('history reconstruction ignores unrelated posts and uses REST authorization', async () => {
  discordEnv();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([
    { id: '1', author: { id: mockBotId }, timestamp: now.toISOString(), embeds: [{ footer: { text: 'TFT & Golden Spatula | 2026-10-14 | 51/100' } }] },
    { id: '2', author: { id: 'another-bot' }, timestamp: now.toISOString(), embeds: [] },
  ]);
  try { assert.equal((await postingHistory('2026-10-14')).length, 1); }
  finally { globalThis.fetch = original; }
});

test('uploads suppress mentions and include a stable nonce and history marker', async () => {
  discordEnv();
  assert.equal(config().channelId, '1373136118270394459');
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const form = init?.body as FormData;
    const payload = JSON.parse(String(form.get('payload_json')));
    assert.equal(payload.enforce_nonce, true);
    assert.equal(payload.nonce, 'meme-2026-10-14-50');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].footer.text, 'TFT & Golden Spatula | 2026-10-14 | 51/100');
    assert.ok(form.get('files[0]') instanceof Blob);
    return Response.json({ id: '123' });
  };
  try { await sendMeme(Buffer.from('image'), '2026-10-14', 50); }
  finally { globalThis.fetch = original; }
});

const sourcedFixture: SourcedMeme = {
  image: Buffer.from('gif'), contentType: 'image/gif', extension: 'gif',
  source: { title: 'Pengu celebrates', sourceUrl: 'https://tenor.com/view/happy-pengu-gif-123456',
    imageUrl: 'https://media.tenor.com/example/happy-pengu.gif', creator: 'TeamfightTactics on Tenor' },
};

test('existing source content is posted before generating a meme, with exclusions forwarded', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { deps } = fakeDeps();
  let generated = false;
  let credited = false;
  deps.recentSourceKeys = async () => new Set(['x:1520403799776665601']);
  deps.pickSourcedMeme = async keys => {
    assert.ok(keys.has('x:1520403799776665601'));
    return sourcedFixture;
  };
  deps.renderMeme = async () => { generated = true; return Buffer.from('png'); };
  deps.sendMeme = async (image, _day, _slot, source) => {
    assert.equal(image, sourcedFixture.image);
    assert.equal(source?.source.sourceUrl, sourcedFixture.source.sourceUrl);
    credited = true;
    return { id: 'source-message' };
  };
  const result = await postSlot(50, now, deps);
  assert.equal(result.status, 'sent');
  assert.equal('content' in result && result.content, 'sourced');
  assert.equal(generated, false);
  assert.equal(credited, true);
});

test('unavailable sources or unreadable source history use the generated backup', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  for (const failure of ['source', 'history']) {
    const { deps } = fakeDeps();
    if (failure === 'source') deps.pickSourcedMeme = async () => { throw new Error('provider down'); };
    else deps.recentSourceKeys = async () => { throw new Error('history limit'); };
    const result = await postSlot(50, now, deps);
    assert.equal(result.status, 'sent');
    assert.equal('content' in result && result.content, 'generated');
  }
});

test('only official, relevant and safe Tenor posts are admitted; large GIFs use the smaller original', () => {
  const row = { user: { username: 'TeamfightTactics', usertype: 'partner' },
    itemurl: sourcedFixture.source.sourceUrl, h1_title: 'Pengu celebrates', tags: ['Teamfight Tactics'], flags: [],
    media_formats: { gif: { url: sourcedFixture.source.imageUrl, size: 5_000_000 },
      tinygif: { url: 'https://media.tenor.com/example/small-pengu.gif', size: 120_000 } } };
  const rows = [row, { ...row, user: { username: 'someone-else', usertype: 'user' } },
    { ...row, flags: ['nsfw'] }, { ...row, tags: ['unrelated'] },
    { ...row, itemurl: 'https://example.com/unapproved' }, { ...row, policy_status: 'POLICY_STATUS_BLOCKED' }];
  const html = `<script type="text/x-cache" id="store-cache">${JSON.stringify({ results: rows })}</script>`;
  const found = parseOfficialTenor(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].imageUrl, row.media_formats.tinygif.url);
  assert.deepEqual(parseOfficialTenor('<script id="store-cache">invalid</script>'), []);
});

test('source identity collapses X aliases and rejects unsafe image locations', () => {
  assert.equal(sourceKey('https://x.com/TFT/status/1520403799776665601'), sourceKey('https://twitter.com/TFT/status/1520403799776665601?ref=test'));
  assert.equal(sourceKey(sourcedFixture.source.sourceUrl), 'tenor:123456');
  assert.equal(sourceKey('https://example.com/TFT/status/123'), null);
  for (const url of ['http://media.tenor.com/a.gif', 'https://localhost/a.gif', 'https://media.tenor.com.attacker.test/a.gif', 'https://media.tenor.com:8443/a.gif']) assert.equal(validImageUrl(url), false);
});

test('source repeat checks include the earlier manual sample and ignore other authors and old posts', async () => {
  discordEnv();
  const original = globalThis.fetch;
  const sample = { author: { id: mockBotId }, timestamp: now.toISOString(),
    embeds: [{ url: 'https://x.com/TFT/status/1520403799776665601', footer: { text: 'Fetched meme sample' } }] };
  globalThis.fetch = async () => Response.json([sample,
    { ...sample, author: { id: 'another-bot' }, embeds: [{ url: 'https://x.com/TFT/status/111' }] },
    { ...sample, timestamp: '2026-09-01T00:00:00Z', embeds: [{ url: 'https://x.com/TFT/status/222' }] }]);
  try { assert.deepEqual([...await recentSourceKeys(now)], ['x:1520403799776665601']); }
  finally { globalThis.fetch = original; }
});

test('sourced GIF uploads preserve animation format, source credit, and the scheduling marker', async () => {
  discordEnv();
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const form = init?.body as FormData;
    const payload = JSON.parse(String(form.get('payload_json')));
    assert.ok(payload.attachments[0].filename.endsWith('.gif'));
    assert.equal((form.get('files[0]') as Blob).type, 'image/gif');
    assert.equal(payload.embeds[0].url, sourcedFixture.source.sourceUrl);
    assert.ok(payload.embeds[0].description.includes('TeamfightTactics on Tenor'));
    assert.equal(payload.embeds[0].footer.text, 'TFT & Golden Spatula | 2026-10-14 | 51/100');
    return Response.json({ id: '456' });
  };
  try { await sendMeme(sourcedFixture.image, '2026-10-14', 50, sourcedFixture); }
  finally { globalThis.fetch = original; }
});

test('source downloads enforce the body-size limit even when the server omits content-length', async () => {
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(12)); controller.close();
  } }));
  await assert.rejects(limitedBody(response, 10), /size limit/);
});
