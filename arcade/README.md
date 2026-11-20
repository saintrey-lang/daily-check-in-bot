# Golden Spatula Arcade Discord Activity

The existing Next.js arcade is served inside Discord as an Activity. Players enter a name, Game ID, and PIN, then choose Crosswords or Puzzle. Each game saves its progress to the `ArcadeProgress` tab of the existing Google Sheet. Tapping the game card later resumes that game. **New Game** or selecting a different puzzle image starts a fresh game.

Puzzle choices include the bundled images and image attachments from Discord channel `1573243616925712495`. The bot reads the channel through the Discord API. Images are proxied through `/api/puzzle-image`, so expired Discord attachment URLs do not break a saved puzzle. Images over 4 MB are omitted. The first bundled image remains the first choice.

Completed crossword scores post to `1293667554866499676`. Puzzle scores and exit reports post to `1573243616925712495`, with the selected picture displayed. A player's entered name appears in each post. When the player leaves before finishing, **Exit & Share** posts their current points and saves their work. A `pagehide` beacon also attempts that post when the Discord window closes; Discord and mobile browsers do not guarantee a close event, so use the button when the post must arrive.

## Developer Portal setup

1. In the Discord Developer Portal, open the application whose bot token is configured as `DISCORD_BOT_TOKEN` on the `golden-spatula-arcade` Vercel project. Under **Activities → URL Mappings**, map `/` to `golden-spatula-arcade.vercel.app`. Enable the Activity in **Activities → Settings**. The app's launch entry point appears in Discord after Activities are enabled.
2. Grant that bot **View Channel**, **Read Message History**, **Send Messages**, and **Embed Links** in channel `1573243616925712495`. It needs **Send Messages** in the crossword score channel `1293667554866499676`.
3. Ensure the Vercel arcade project retains `DISCORD_BOT_TOKEN`, `CHECKIN_GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `ARCADE_PIN_PEPPER`, and `ARCADE_SIGNING_SECRET`. `DISCORD_APPLICATION_ID` may be added; if absent, the app derives the public ID from the bot token. The service account must be an Editor on the Sheet. The arcade creates only the `ArcadeProgress` tab and retains the player tabs.
4. Launch the app in a Discord voice or text channel using its Activity entry point. Test a partial move and **Exit & Share**, open the game again, and submit a completed score. Discord may restrict an unverified Activity to its developers and testers in small servers; verification is needed for broad community launch.

The arcade's Vercel site remains the server and image host. The player-facing game launches as the Discord pop-up. No bot token is sent to the browser.
