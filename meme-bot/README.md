# TFT & Golden Spatula Meme Bot

Vercel-hosted Discord image meme service. The target is **100 posts per day** in the configured text channel, using the Asia/Manila calendar day.

It prioritizes existing TFT image memes and reaction GIFs from official TFT sources. Each sourced post preserves the image or animation and credits the original creator with a source link. The official `TeamfightTactics` Tenor page is refreshed hourly; a verified list of official posts is available during discovery outages, alongside three curated @TFT image memes. General gaming, unrelated, flagged NSFW, and spoiler content is excluded.

The bot checks its own channel posts from the last seven days before selecting a source, including the earlier manually posted sample. When suitable unused sources are exhausted or unavailable, it generates a backup gameplay meme from 240 original captions. The 100-post target is a total of sourced and generated posts; it does not guarantee 100 newly published external memes every day. It uses no paid image-generation API and does not require Reddit or X API credentials for these public source images.

## Hosting and schedule

- GitHub project folder: `meme-bot`.
- A dedicated Vercel project builds this folder.
- `vercel.json` defines 100 cron jobs, each executing once per day. Each posts one meme.
- Scheduled intervals alternate between 14 and 15 minutes. On Vercel Hobby, actual executions can be delayed by up to 59 minutes; they remain 100 daily jobs. Precise timing depends on the hosting plan.
- The bot reads its own Discord meme posts to track completed slots across redeployments. Stable message nonces prevent simultaneous calls from posting the same slot twice. It fails closed when it cannot verify daily channel history. If recent source history cannot be verified, sourced content is skipped and the generated backup is used.
- Bot credentials and cron authorization are private production environment variables. API endpoints require `Authorization: Bearer <CRON_SECRET>`.
- There is no always-running Discord Gateway process, so this serverless bot will not maintain an online presence indicator.

## Configuration

`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MEME_CHANNEL_ID`, `CRON_SECRET` (at least 32 random characters), and `MEME_BOT_ENABLED=true` are required to post. Keep credentials out of the repository. For persistent pause controls, create the bot's status message using `/api/control`, then store the returned `messageId` as `MEME_CONTROL_MESSAGE_ID` and redeploy.

The bot must be installed in the configured server and have **View Channel**, **Send Messages**, **Attach Files**, **Embed Links**, and **Read Message History** in the target channel. Message Content and Server Members intents are unnecessary.

## Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Check token, server/channel access, and message history |
| `/api/status` | GET | Today's sourced/generated counts, content mode, and pause state |
| `/api/cron/0` through `/api/cron/99` | GET | Authenticated scheduled posting |
| `/api/preview` | GET | Render a private preview without posting |
| `/api/control` | POST | Pause/resume using `{ "paused": true }` or `{ "paused": false }` |

When delivery is uncertain, the bot checks Discord history for confirmation. Failed slots, downtime, disabled/paused posting, and setup partway through a day can produce fewer than 100 posts. Missed slots are skipped; the service does not flood the channel to catch up. Starting tomorrow with working permissions and hosting gives a full daily schedule. Deleting posted meme messages also removes their posting-history records, so keep them if duplicate tracking is required. Pause controls can allow an already-sending message to finish.

## Local verification

```bash
npm ci
npm test
npm run build
```

The font subset is derived from DejaVu Sans Bold and includes its license under `assets/FONT-LICENSE.txt`.

Official references:
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://docs.discord.com/developers/resources/message#create-message
