# TFT & Golden Spatula Meme Bot

Vercel-hosted Discord image meme service. The target is **100 posts per day** in the configured text channel, using the Asia/Manila calendar day.

It creates original gameplay jokes about the shop, rerolls, contested carries, economy, upgrades, items, scouting, positioning, and ranked games. Captions rotate through 240 original combinations and four visual palettes. It does not fetch general internet memes or use paid image-generation APIs.

## Hosting and schedule

- GitHub project folder: `meme-bot`.
- A dedicated Vercel project builds this folder.
- `vercel.json` defines 100 cron jobs, each executing once per day. Each posts one meme.
- Scheduled intervals alternate between 14 and 15 minutes. On Vercel Hobby, actual executions can be delayed by up to 59 minutes; they remain 100 daily jobs. Precise timing depends on the hosting plan.
- A private Vercel Blob store contains immutable per-day/per-slot claims, results, and the pause control. Duplicate cron calls cannot claim the same slot again.
- Bot credentials and cron authorization are private production environment variables. API endpoints require `Authorization: Bearer <CRON_SECRET>`.
- There is no always-running Discord Gateway process, so this serverless bot will not maintain an online presence indicator.

## Configuration

`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MEME_CHANNEL_ID`, `CRON_SECRET` (at least 32 random characters), and `MEME_BOT_ENABLED=true` are required to post. Connect the private Blob store to provision `BLOB_STORE_ID` and rotating OIDC credentials. Keep credentials out of the repository.

The bot must be installed in the configured server and have **View Channel**, **Send Messages**, and **Attach Files** in the target channel. Message Content and Server Members intents are unnecessary.

## Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Check token, server/channel access, and storage |
| `/api/status` | GET | Today's recorded delivery counts and pause state |
| `/api/cron/0` through `/api/cron/99` | GET | Authenticated scheduled posting |
| `/api/preview` | GET | Render a private preview without posting |
| `/api/control` | POST | Pause/resume using `{ "paused": true }` or `{ "paused": false }` |

If a Discord send fails or has uncertain delivery, its immutable claim is retained to prevent repeated messages. Failed slots, downtime, disabled/paused posting, and setup partway through a day can produce fewer than 100 posts. Missed slots are skipped; the service does not flood the channel to catch up. Starting tomorrow with working permissions and hosting gives a full daily schedule.

## Local verification

```bash
npm ci
npm test
npm run build
```

The font subset is derived from DejaVu Sans Bold and includes its license under `assets/FONT-LICENSE.txt`.

Official references:
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/vercel-blob/using-blob-sdk
- https://docs.discord.com/developers/resources/message#create-message
