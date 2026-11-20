# GOLDEN CREATOR Privacy Policy — DRAFT

**Do not publish this draft until the review items in `review.md` are resolved.**

Effective date: [PUBLICATION DATE]

Operator and privacy contact: [LEGAL OPERATOR NAME], [SUPPORT EMAIL]. This policy covers the GOLDEN CREATOR Discord application, the Golden Spatula Arcade Activity, the check-in worker, and the separately deployed Creator bot. This draft reflects source review of those services; the operator must confirm the actual program practices before publication.

## Data we handle

- **Arcade entry:** The name and Game ID you enter, a salted and hashed version of your four-digit PIN, account creation and last sign-in times, failed PIN attempts and temporary lockout time. An authenticated cookie contains your Game ID, name, and a signed session value and expires after 24 hours. The Arcade does not request your Discord account password.
- **Arcade play:** Your selected game and picture, crossword letters or puzzle moves, current points, saved session and revision, update and completion times, and final score, elapsed time, and move count. The app briefly uses an IP address in memory to limit sign-in attempts; the hosting provider may also create normal request logs.
- **Discord check-ins:** Discord user ID, username, display name, check-in code and date, streak and milestone, and the relevant message and channel IDs. The bot reads messages in the configured check-in channel to recognize the daily code.
- **Starplayer submissions:** Discord user ID, username and display name, task category, title and date, a link or uploaded file, submission time, and the submission message and channel references.
- **Creator program:** Discord ID, creator name, campaign, rank, points, content counts, views, engagements, budget and approved-spend figures, and status. Creator content submissions include Discord username, platform, content URL, notes, submission and review times, reviewer and review status, payout figure, and message references. The bot can show a creator's own status and submissions privately, publish leaderboards, send review result DMs, and refresh YouTube video metrics where enabled.
- **Server activity statistics:** Discord user ID and display name, channel ID and name, daily message counts, voice participation time, and related role or roster information where configured. The statistics feature does not save general message text in its statistics table.
- **Puzzle pictures:** Image attachments posted in the configured Discord puzzle channel are shown as choices in the Activity and displayed with puzzle score posts.

## Why and where we use it

We use these records to authenticate Arcade entries, save and resume games, calculate points and scores, post results, run daily check-ins and Starplayer submissions, manage creator program submissions and reviews, prevent duplicate or abusive activity, and make server reports available to authorized operators. The bot posts Arcade results to the configured Discord channels. A completed result shows the entered name, score, time, and for puzzles the selected image; a partial exit post also shows the Game ID and current points. Check-in, Starplayer, creator review, and leaderboard posts are visible to people with access to their Discord channels, while private command replies and DMs go to the relevant user. Discord channel permissions control who can see channel posts.

## Storage and service providers

Arcade player records, saved progress, check-ins, creator records and submissions, and statistics are stored in Google Sheets accessible to the operator and authorized service accounts. The Arcade and Creator bot run on Vercel. The application uses Discord to read channel content, display Activity content, and send messages. A persistent worker host runs check-in and statistics features. Where YouTube metric refresh is enabled, the Creator bot sends video IDs to the YouTube Data API to obtain public video statistics. These providers process data to deliver the service under their own terms and privacy notices. We do not transmit the PIN itself to Discord score posts.

## Retention and deletion

The current implementation does not automatically delete Google Sheet records after a fixed period. Records remain until the operator removes them or establishes a retention schedule. Discord posts and files may remain in their channels separately from Sheet records. The 24-hour Arcade cookie expires automatically; short-lived sign-in rate-limit entries are held in server memory. Contact [SUPPORT EMAIL] to request access, correction, or deletion of records we control. We may need to verify that a request relates to your Game ID or Discord account before acting; Discord channel posts may need to be removed separately.

## Security and changes

The Arcade stores a salted hash of the PIN rather than the PIN text and signs its session cookies. Access to the Google Sheets and service credentials is limited to authorized operators and services. No service can guarantee absolute security. We may update this policy as the application changes and will show the new effective date here.

## Contact

Contact [SUPPORT EMAIL] about privacy or your data. If you use the app through Discord, Discord's own privacy policy also applies to Discord's handling of your account and channel data.
