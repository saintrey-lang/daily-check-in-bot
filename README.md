# Discord daily check-in

This project has a password-protected Vercel dashboard and a separate, continuously running Discord worker. It uses the **existing Discord bot**. Players type the day's code in channel `1503972816079425706`; the worker sends a verified embed and appends one row per player/day to the provided [Google Sheet](https://docs.google.com/spreadsheets/d/13OEb5uguT-KPDvTwrnsRcv_WEhWf1ZeAsaF3-uDmYnA/edit).

## Dashboard

- Edit the daily announcement and the verified reply: title, body, accent color, PNG/JPG/GIF/WebP image or PDF attachment up to 1 MB. Images show within the Discord embed; PDFs appear as a file below it. Files are stored in a `CheckinAssets` tab in the same Sheet.
- Edit the 15 codes (Day 1 must be `MONDAY`) and timezone. Tokens such as `{day}`, `{code}`, `{daysLeft}`, `{streak}`, `{timezone}` are replaced when sent. The daily code is always shown as a separate field in the prompt.
- Press **Start Day 1** after saving edits. Day 1 opens immediately; the worker posts its `MONDAY` prompt within about 10 seconds while online. Each later day starts at 8:00 AM in the selected timezone, regardless of what weekday you started. The event ends after 15 daily windows. The same dashboard can start a fresh run after the prior event ends.
- Edits made during an event update the current day's announcement when the worker next syncs; future replies use the latest template.
- Day 4, 7 and 15 consecutive check-ins get milestone congratulations. A missed day resets the streak. Codes are case-insensitive and each player can check in only once per day.

## Setup

1. Share the Google Sheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as **Editor**, and ensure the service account has the Google Sheets API enabled. The app creates `Checkins`, `CheckinPrompts`, `CheckinConfig` and `CheckinAssets`; it does not touch other tabs.
2. Give the existing Discord bot **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, and **Read Message History** in the target channel. Enable **Message Content Intent** for its bot application in the Discord Developer Portal so ordinary text codes can be read.
3. Deploy this repository to Vercel. Add `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and a new 16+ character `DASHBOARD_PASSWORD` to the Vercel project's environment variables. Redeploy, sign in to the dashboard, and save your desired messages.
4. Create **one persistent Node.js 24 service** from this same repository (e.g. a Railway worker service), with start command `npm run worker`. Set `DISCORD_BOT_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `CHECKIN_GOOGLE_SHEET_ID`, `CHECKIN_CHANNEL_ID`, `CHECKIN_GUILD_ID`, and `CHECKIN_TIMEZONE` on the worker. The worker and dashboard must use the same Google Sheet. Do not run the worker in a Vercel Function; it needs a continuous Gateway connection.
5. Wait for worker log `Check-in bot connected as …`. Press **Start Day 1** in the dashboard. Wait for `DAY 1 CHECK-IN` and `MONDAY` in Discord. Type `monday` as a player: expect `DAY 1 - CHECK-IN VERIFIED`, 14 days left, and a new `Checkins` row.

The existing creator bot deployment can remain in place. Reuse its Discord token and Google service account if they have access to the requested channel and Sheet. The check-in dashboard password stays only on Vercel. Keep credentials out of Git.

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
