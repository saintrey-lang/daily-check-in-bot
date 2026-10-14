import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { authorized } from '../lib/auth.ts';
import { CAPTION_COUNT, pickMeme } from '../lib/catalog.ts';
import { config, DiscordFailure, sendMeme } from '../lib/discord.ts';
import { postSlot, dependencies } from '../lib/post.ts';
import { renderMeme } from '../lib/render.ts';
import { claimSlot } from '../lib/store.ts';
import { cronDefinitions, currentSlot, DAILY_LIMIT, localDay, scheduledInstance, SLOT_MINUTES, validSlot } from '../lib/schedule.ts';

const now = new Date('2026-10-14T04:00:00Z'); // 12:00 Manila; slot 50.

test('100 unique cron jobs execute once daily with 14/15 minute spacing', () => {
  const jobs = cronDefinitions();
  assert.equal(jobs.length, 100);
  assert.equal(new Set(jobs.map(j => j.path)).size, 100);
  assert.equal(new Set(jobs.map(j => j.schedule)).size, 100);
  assert.equal(jobs[0].schedule, '0 16 * * *');
  for (let i = 1; i < SLOT_MINUTES.length; i++) assert.ok([14, 15].includes(SLOT_MINUTES[i] - SLOT_MINUTES[i - 1]));
  assert.ok(jobs.every(j => j.schedule.endsWith(' * * *')));
  assert.deepEqual(JSON.parse(readFileSync('vercel.json', 'utf8')).crons, jobs);
});

test('local midnight and late final slots are assigned to the correct day', () => {
  assert.equal(localDay(new Date('2026-10-13T16:00:00Z')), '2026-10-14');
  const late = scheduledInstance(99, new Date('2026-10-14T16:12:00Z'));
  assert.equal(late.day, '2026-10-14');
  assert.equal(late.stale, false);
  assert.equal(currentSlot(now), 50);
});

test('stale and invalid slots cannot be posted', () => {
  assert.equal(scheduledInstance(0, now).stale, true);
  for (const input of ['100', '-1', '1.5', '00', '2foo', '']) assert.equal(validSlot(input), null);
  assert.equal(validSlot('99'), 99);
  assert.throws(() => scheduledInstance(100, now));
});

test('each daily batch contains 100 distinct game-specific captions', () => {
  assert.equal(CAPTION_COUNT, 240);
  const memes = Array.from({ length: DAILY_LIMIT }, (_, i) => pickMeme('2026-10-14', i));
  assert.equal(new Set(memes.map(m => m.id)).size, 100);
  assert.ok(memes.every(m => /TFT|Golden Spatula/.test(m.top)));
  assert.deepEqual(pickMeme('2026-10-14', 50), pickMeme('2026-10-14', 50));
});

test('images render at 1080 square with bundled fonts', async () => {
  const image = await renderMeme(pickMeme('2026-10-14', 0));
  const info = await sharp(image).metadata();
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1080);
  assert.equal(info.format, 'png');
  assert.ok(image.length > 20_000 && image.length < 4_000_000);
});

test('post endpoints reject missing and incorrect credentials', () => {
  process.env.CRON_SECRET = 'x'.repeat(48);
  assert.equal(authorized(new Request('https://example.test')), false);
  assert.equal(authorized(new Request('https://example.test', { headers: { authorization: 'Bearer incorrect' } })), false);
  assert.equal(authorized(new Request('https://example.test', { headers: { authorization: 'Bearer ' + 'x'.repeat(48) } })), true);
});

function fakeDeps() {
  const state = { claims: new Set<string>(), sends: 0, results: [] as string[] };
  const deps: typeof dependencies = {
    pickMeme, validateChannel: async () => ({}), renderMeme: async () => Buffer.from('png'),
    isPaused: async () => false,
    claimSlot: async (day, slot) => { const key = `${day}/${slot}`; if (state.claims.has(key)) return false; state.claims.add(key); return true; },
    sendMeme: async () => { state.sends++; return { id: '123456789' }; },
    recordResult: async (_day, _slot, status) => { state.results.push(status); },
  };
  return { state, deps };
}

test('repeated or simultaneous invocations send one message per slot', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  await Promise.all([postSlot(50, now, deps), postSlot(50, now, deps), postSlot(50, now, deps)]);
  assert.equal(state.sends, 1);
  assert.deepEqual(state.results, ['sent']);
});

test('disabled, paused, and stale invocations do not send', async () => {
  const { state, deps } = fakeDeps();
  process.env.MEME_BOT_ENABLED = 'false';
  assert.equal((await postSlot(50, now, deps)).status, 'disabled');
  process.env.MEME_BOT_ENABLED = 'true';
  assert.equal((await postSlot(0, now, deps)).status, 'stale');
  deps.isPaused = async () => true;
  assert.equal((await postSlot(50, now, deps)).status, 'paused');
  assert.equal(state.sends, 0);
});

test('a permission rejection is recorded and never retried into a duplicate', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.sendMeme = async () => { state.sends++; throw new DiscordFailure(403); };
  assert.equal((await postSlot(50, now, deps)).status, 'failed');
  assert.equal((await postSlot(50, now, deps)).status, 'already_claimed');
  assert.equal(state.sends, 1);
  assert.deepEqual(state.results, ['failed']);
});

test('uncertain delivery keeps the durable claim and cannot repeat', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.sendMeme = async () => { state.sends++; throw new Error('timeout'); };
  assert.equal((await postSlot(50, now, deps)).status, 'uncertain');
  assert.equal((await postSlot(50, now, deps)).status, 'already_claimed');
  assert.equal(state.sends, 1);
});

test('permission/storage failures before a claim do not send', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.validateChannel = async () => { throw new DiscordFailure(404); };
  await assert.rejects(postSlot(50, now, deps));
  assert.equal(state.sends, 0);
  assert.equal(state.claims.size, 0);
});

test('successful delivery with a result-write error remains confirmed', async () => {
  process.env.MEME_BOT_ENABLED = 'true';
  const { state, deps } = fakeDeps();
  deps.recordResult = async () => { throw new Error('unavailable'); };
  const result = await postSlot(50, now, deps);
  assert.equal(result.status, 'sent');
  assert.equal('recorded' in result && result.recorded, false);
  await postSlot(50, now, deps);
  assert.equal(state.sends, 1);
});

test('Blob conflict is confirmed; a genuine storage outage fails closed', async () => {
  const existing = { put: async () => { throw new Error('exists'); }, get: async () => ({ statusCode: 200 }) };
  assert.equal(await claimSlot('2026-10-14', 50, existing as never), false);
  const unavailable = { put: async () => { throw new Error('offline'); }, get: async () => null };
  await assert.rejects(claimSlot('2026-10-14', 50, unavailable as never), /offline/);
});

test('Discord upload suppresses mentions and uses an idempotency nonce', async () => {
  process.env.DISCORD_BOT_TOKEN = 'mock-token';
  process.env.DISCORD_GUILD_ID = '1293483684888055840';
  process.env.MEME_CHANNEL_ID = '1373136118270394459';
  assert.equal(config().channelId, '1373136118270394459');
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const form = init?.body as FormData;
    const payload = JSON.parse(String(form.get('payload_json')));
    assert.equal(payload.enforce_nonce, true);
    assert.equal(payload.nonce, 'meme-2026-10-14-50');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.ok(form.get('files[0]') instanceof Blob);
    return Response.json({ id: '123' });
  };
  try { await sendMeme(Buffer.from('image'), '2026-10-14', 50); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});
