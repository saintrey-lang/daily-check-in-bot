# Discord daily check-in

This project has a Vercel team-protected dashboard and a separate, continuously running Discord worker. It uses the **existing Discord bot**. Players type the day's code in the configured Discord channel; the worker sends a verified embed and appends one row per player/day to the Google Sheet configured through `CHECKIN_GOOGLE_SHEET_ID`.

## Dashboard

- Edit the daily announcement and the verified reply: title, body, accent color, PNG/JPG/GIF/WebP image or PDF attachment up to 1 MB. Images show within the Discord embed; PDFs appear as a file below it. Files are stored in a `CheckinAssets` tab in the same Sheet.
- Edit each of the 15 daily codes, the daily reset time, and the timezone before starting. The default Day 1 code is `MONDAY`, but you can change it. Tokens such as `{day}`, `{code}`, `{daysLeft}`, `{streak}`, `{resetTime}`, `{timezone}` are replaced when sent. The daily code is always shown as a separate field in the prompt.
- Press **Start Day 1** after saving edits. Day 1 opens immediately; the worker posts the chosen Day 1 code within about 10 seconds while online. Each later day starts at the selected reset time in the selected timezone, regardless of what weekday you started. The event ends after 15 daily windows. The same dashboard can start a fresh run after the prior event ends.
- Codes and reset time remain editable during a run. A changed code updates the current day's announcement when the worker syncs; a reset-time change takes effect on the next local calendar day and leaves earlier day boundaries intact. The timezone remains fixed until the run ends. Future replies use the latest template.
- Day 4, 7 and 15 consecutive check-ins get milestone congratulations. A missed day resets the streak. Codes are case-insensitive and each player can check in only once per day.

## Setup

1. Keep the Google Sheet **Restricted** and share it with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as **Editor**. Ensure the service account has the Google Sheets API enabled. The app creates `Checkins`, `CheckinPrompts`, `CheckinConfig` and `CheckinAssets`; it does not touch other tabs.
2. Give the existing Discord bot **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, and **Read Message History** in the target channel. Enable **Message Content Intent** for its bot application in the Discord Developer Portal so ordinary text codes can be read.
3. Connect this repository to the `creator-checkin-bot` Vercel project. Keep **Vercel Authentication → Require Log In** enabled for the project's `.vercel.app` domains, and make dashboard operators members of the Vercel team. The dashboard itself has no separate login; its API routes rely on this project-wide protection. Do not disable it or use a shareable protection-bypass link as the dashboard URL.
4. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `CHECKIN_GOOGLE_SHEET_ID` in the Vercel project's Production environment. Redeploy, open the production URL as a team member, and save your desired messages. Keep the private key out of Git.
5. Create **one persistent Node.js 24 service** from this same repository, with start command `npm run worker`. Set `DISCORD_BOT_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `CHECKIN_GOOGLE_SHEET_ID`, `CHECKIN_CHANNEL_ID`, `CHECKIN_GUILD_ID`, and `CHECKIN_TIMEZONE` on the worker. The worker and dashboard must use the same Google Sheet. Do not run the worker in a Vercel Function; it needs a continuous Gateway connection.
6. Wait for worker log `Check-in bot connected as …`. Press **Start Day 1** in the dashboard. Wait for the Day 1 prompt and your selected code in Discord. Type that code as a player: expect `DAY 1 - CHECK-IN VERIFIED`, 14 days left, and a new `Checkins` row.

The existing creator bot deployment can remain in place. Reuse its Discord token and Google service account if they have access to the requested channel and Sheet. Keep credentials out of Git.

## Local development

```bash
npm ci
cp .env.example .env
# Fill credentials in .env (the Next dashboard also reads it via dotenv in local Next development).
npm run dev
# In another terminal with the same .env file:
npm run worker
npm test
npm run typecheck
```

The worker can miss player messages while it is offline. Once it reconnects it posts any missing current-day announcement, and players can resend their codes. Run exactly one worker instance to avoid duplicate writes.
